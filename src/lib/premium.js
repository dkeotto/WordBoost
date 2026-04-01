function isPremiumUser(user, nowMs = Date.now()) {
  try {
    if (!user?.premiumUntil) return false;
    return new Date(user.premiumUntil).getTime() > nowMs;
  } catch (_) {
    return false;
  }
}

/** Abonelik premium veya Paddle AI+ (tek seferlik) — AI Mode günlük limiti için */
function hasUnlimitedAiMode(user, nowMs = Date.now()) {
  if (isPremiumUser(user, nowMs)) return true;
  try {
    return user?.entitlements?.aiPlus === true;
  } catch (_) {
    return false;
  }
}

module.exports = { isPremiumUser, hasUnlimitedAiMode };

