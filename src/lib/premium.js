function isPremiumUser(user, nowMs = Date.now()) {
  try {
    if (!user?.premiumUntil) return false;
    return new Date(user.premiumUntil).getTime() > nowMs;
  } catch (_) {
    return false;
  }
}

module.exports = { isPremiumUser };

