import {
  $query,
  $init,
  $update,
  Record,
  StableBTreeMap,
  match,
  Result,
  nat64,
  Vec,
  int32,
  ic,
  Opt,
  float32,
  nat16,
  Principal,
} from "azle";
import { v4 as uuidv4 } from "uuid";

type Subscription = Record<{
  id: string;
  subscriber: Principal;
  price: float32;
  days: nat16;
  expiryDate: int32;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type SubscriptionPayload = Record<{
  price: float32;
  days: nat16;
}>;

let subscriptionOwner: Principal;
let initialized: boolean = false;

$update;
export function init(): Result<string, string> {
  if (!initialized) {
    subscriptionOwner = ic.caller();
  }

  return Result.Ok("initialized");
}

const subscriptionExpiry: nat16 = 2592000;

const subscriptionStorage = new StableBTreeMap<string, Subscription>(
  0,
  44,
  100_000
);

/**
 * Function that allows users to subscribe to the service by sending the exact subscription price
 * It sets the subscription expiry timestamp to 30 days from the current timestamp
 */

$update;
export function createSubscription(
  payload: SubscriptionPayload
): Result<Subscription, string> {
  if (payload.price <= 0 || payload.days <= 0) {
    return Result.Err(
      "Invalid payload: price and days must be positive numbers."
    );
  }

  const { price, days } = payload;

  if (days > 65535) {
    return Result.Err(
      "Invalid payload: days must not exceed the maximum value of nat16."
    );
  }

  const subscribe: Subscription = {
    price,
    days,
    id: uuidv4(),
    subscriber: ic.caller(),
    createdAt: ic.time(),
    expiryDate: Number(ic.time()) + days * subscriptionExpiry,
    updatedAt: Opt.None,
  };

  try {
    subscriptionStorage.insert(subscribe.id, subscribe);
    return Result.Ok(subscribe);
  } catch (error) {
    return Result.Err(`Failed to create subscription: ${error}`);
  }
}

//$query;
function getSubscription(id: string): Result<Subscription, string> {
  return match(subscriptionStorage.get(id), {
    Some: (subscribe) => {
      if (subscribe.subscriber.toString() === ic.caller().toString()) {
        return Result.Ok<Subscription, string>(subscribe);
      }

      return Result.Err<Subscription, string>("Not authorised subscriber");
    },
    None: () =>
      Result.Err<Subscription, string>(`Subscription id=${id} not found`),
  });
}

// Function to get all subscriptions of a subscriber
$query;
export function getSubscriptionsBySubscriber(
  subscriber: Principal
): Result<Vec<Subscription>, string> {
  const subscriptions = subscriptionStorage
    .values()
    .filter((sub) => sub.subscriber.toString() === subscriber.toString());
  if (subscriptions.length === 0) {
    return Result.Err(
      `No subscriptions found for subscriber: ${subscriber.toString()}`
    );
  }
  return Result.Ok<Vec<Subscription>, string>(subscriptions);
}

// Function to get all available subscriptions
$query;
export function getAllSubscriptions(): Result<Vec<Subscription>, string> {
  try {
    const subscriptions = subscriptionStorage.values();
    return Result.Ok<Vec<Subscription>, string>(subscriptions);
  } catch (error) {
    return Result.Err<Vec<Subscription>, string>(
      `Error retrieving subscriptions: ${error}`
    );
  }
}

/**
 * Function that allows users to cancel their subscription.
 * It refunds the remaining subscription period's payment to the user
 */

$update;
export function cancelSubscription(id: string): Result<Subscription, string> {
  return match(subscriptionStorage.get(id), {
    Some: (subscribe) => {
      if (subscribe.subscriber.toString() !== ic.caller().toString()) {
        return Result.Err<Subscription, string>(
          `Cancellation failed: Caller is not the subscriber of subscription id=${id}`
        );
      }
      subscriptionStorage.remove(id);
      return Result.Ok<Subscription, string>(subscribe);
    },
    None: () =>
      Result.Err<Subscription, string>(
        `Subscription cancellation id=${id} failed`
      ),
  });
}

/**
 * Allows users to renew their subscription by sending the subscription price to add
 * It extends the subscription expiry timestamp by 30 days from the current expiry time
 */

$update;
export function renewSubscription(
  id: string,
  price: number
): Result<Subscription, string> {
  // Validate input parameters
  if (typeof id !== "string" || typeof price !== "number" || price <= 0) {
    return Result.Err<Subscription, string>("Invalid input parameters");
  }

  const subscription = cancelSubscription(id);

  if (subscription.Ok) {
    if (subscription.Ok.subscriber.toString() !== ic.caller().toString()) {
      return Result.Err<Subscription, string>("Not authorised subscriber");
    }

    const updateSubscription = {
      ...subscription.Ok,
      price: subscription.Ok.price + price,
    };

    subscriptionStorage.insert(updateSubscription.id, updateSubscription);

    return Result.Ok<Subscription, string>(updateSubscription);
  }

  return Result.Err<Subscription, string>(`Subscription id=${id} not found`);
}

/**
 * Function that allows the service owner to withdraw the canister's balance
 * i.e. the accumulated subscription payments
 */
$update;
export function withdrawFunds(id: string): Result<Subscription, string> {
  const subscription = getSubscription(id);

  if (subscription.Ok) {
    const updateSubscription = {
      ...subscription.Ok,
      price: 0,
    };

    subscriptionStorage.insert(updateSubscription.id, updateSubscription);

    return Result.Ok<Subscription, string>(updateSubscription);
  }

  return Result.Err<Subscription, string>(`Subscription id=${id} not found`);
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
