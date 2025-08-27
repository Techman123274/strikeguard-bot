// utils/lockdown.js
import ControlFlag from "../models/ControlFlag.js";

let cached = { value: false, fetchedAt: 0 };
const TTL_MS = 15_000; // 15s cache

export async function getLockdown() {
  const now = Date.now();
  if (now - cached.fetchedAt < TTL_MS) return !!cached.value;

  const doc = await ControlFlag.findOne({ key: "lockdown" }).lean();
  cached = { value: doc?.value === true, fetchedAt: now };
  return !!cached.value;
}

export async function setLockdown(enabled, actor) {
  const doc = await ControlFlag.findOneAndUpdate(
    { key: "lockdown" },
    {
      $set: {
        value: !!enabled,
        updatedBy: actor ? { id: actor.id, tag: actor.tag } : undefined,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
  // bust cache immediately
  cached = { value: doc.value === true, fetchedAt: Date.now() };
  return !!doc.value;
}

// simple helper
export function isDev(interaction, config, member) {
  return (
    interaction.user.id === config.ownerId ||
    member?.roles?.cache?.has(config.devRoleId)
  );
}
