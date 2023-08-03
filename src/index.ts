import {
  $query,
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


const subscriptionExpiry: nat16 = 2592000;

const subscriptionSTorage = new StableBTreeMap<string, Subscription>(0, 44, 100_000);

/**
 * Function that allows users to subscribe to the service by sending the exact subscription price 
 * It sets the subscription expiry timestamp to 30 days from the current timestamp
 */

$update;
export function createSubscription(payload: SubscriptionPayload): Result<Subscription, string> {
  const subscribe: Subscription = {
    id: uuidv4(),
    subscriber: ic.caller(),
    createdAt: ic.time(),
    expiryDate: Number(ic.time()) + subscriptionExpiry,
    updatedAt: Opt.None,
    ...payload,
  };

  subscriptionSTorage.insert(subscribe.id, subscribe);
  return Result.Ok(subscribe);
}

/**
 * 
 */

$query;
export function getSubscription(id: string): Result<Subscription, string> {
  return match(subscriptionSTorage.get(id), {
    Some: (subscribe) => {
      if (subscribe.subscriber.toString() === ic.caller().toString()) {
        return Result.Ok<Subscription, string>(subscribe);
      }

      return Result.Err<Subscription, string>(
        "Not authorised subscriber");
    },
    None: () => Result.Err<Subscription, string>(
      `Subscription id=${id} not found`
    ),
  });
}

// Function to get all subscriptions of a subscriber
$query;
export function getSubscriptionsBySubscriber(subscriber: Principal): Result<Vec<Subscription>, string> {
  const subscriptions = subscriptionSTorage.values().filter(sub => sub.subscriber.toString() === subscriber.toString());
  return Result.Ok<Vec<Subscription>, string>(subscriptions);
}

// Function to get all subscriptions
$query;
export function getAllSubscriptions(): Result<Vec<Subscription>, string> {
  return Result.Ok<Vec<Subscription>, string>(subscriptionSTorage.values());
}

$update;
export function cancelSupscription(id: string): Result<Subscription, string> {
  return match(subscriptionSTorage.get(id), {
    Some: (subscribe) => {
      if (subscribe.subscriber.toString() !== ic.caller().toString()) {
        return Result.Err<Subscription, string>("Not subscriber");
      }
      subscriptionSTorage.remove(id);
      return Result.Ok<Subscription, string>(subscribe);
    },
    None: () =>
      Result.Err<Subscription, string>(
        `Subscription cancellation id=${id} failed`
      )
  });
}

$update;
export function renewSubscription(id: string, price: number): Result<Subscription, string> {
  const subscription = cancelSupscription(id);

  if (subscription.Ok) {

    if (subscription.Ok.subscriber.toString() !== ic.caller().toString()) {
      return Result.Err<Subscription, string>("Not authorised subscriber");
    }
    const updateSubscription = {
      ...subscription.Ok,
      price: subscription.Ok.price + price,
    };

    subscriptionSTorage.insert(updateSubscription.id, updateSubscription);

    return Result.Ok<Subscription, string>(updateSubscription);
  }

  return Result.Err<Subscription, string>(`Subscription id=${id} not found`);
}

$update;
export function withdrawFunds(id: string): Result<Subscription, string> {
  const subscription = getSubscription(id);

  if (subscription.Ok) {

    if (subscription.Ok.subscriber.toString() !== ic.caller().toString()) {
      return Result.Err<Subscription, string>("Not authorised subscriber");
    }
    const updateSubscription = {
      ...subscription.Ok,
      amount: 0,
    };

    subscriptionSTorage.insert(updateSubscription.id, updateSubscription);

    return Result.Ok<Subscription, string>(updateSubscription);
  }

  return Result.Err<Subscription, string>(`Subscription id=${id} not found`);
}


// a workaround to make uuid package work with Azle
globalThis.crypto = {
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  }
};