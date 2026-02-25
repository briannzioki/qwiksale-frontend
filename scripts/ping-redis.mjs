import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const key = "keepalive:last_ping";
const now = new Date().toISOString();

await redis.set(key, now);
const val = await redis.get(key);

console.log("Upstash keepalive OK:", val);
