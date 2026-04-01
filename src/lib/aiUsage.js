function todayKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function applyDailyAiUsage(user, inc = 1, now = new Date()) {
  const key = todayKey(now);
  if (!user.aiUsage) user.aiUsage = { dayKey: "", count: 0, updatedAt: null };
  if (user.aiUsage.dayKey !== key) {
    user.aiUsage.dayKey = key;
    user.aiUsage.count = 0;
  }
  user.aiUsage.count += inc;
  user.aiUsage.updatedAt = new Date(now);
  return user.aiUsage.count;
}

function isFreeAiAllowed(user, limitPerDay = 3, now = new Date()) {
  const key = todayKey(now);
  const used = user?.aiUsage?.dayKey === key ? (user.aiUsage.count || 0) : 0;
  return used < limitPerDay;
}

module.exports = { todayKey, applyDailyAiUsage, isFreeAiAllowed };

