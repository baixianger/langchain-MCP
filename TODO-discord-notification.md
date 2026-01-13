# TODO: Discord Notification for New User Registration

## Overview
Add a feature to notify via Discord webhook when a new user registers.

## Prerequisites
- [ ] Create a Discord webhook URL for your desired channel
- [ ] Add `DISCORD_WEBHOOK_URL` to environment variables

## Implementation Steps

### 1. Add Discord webhook configuration
- [ ] Add `DISCORD_WEBHOOK_URL` to `/packages/api/src/config.ts`
- [ ] Add to `.env.example` for documentation

### 2. Create Discord notification utility
- [ ] Create `/packages/api/src/lib/discord.ts`
- [ ] Implement `sendDiscordNotification(message)` function
- [ ] Handle errors gracefully (don't break registration if Discord fails)

### 3. Integrate into user registration
- [ ] Modify `/packages/api/src/routes/auth.ts`
- [ ] In `findOrCreateUser()`, detect when a NEW user is created (not returning user)
- [ ] Call Discord notification after successful user creation

### 4. Message format
- [ ] Include: user email, name, timestamp
- [ ] Use Discord embed for nice formatting (optional)

## Files to modify
- `/packages/api/src/config.ts` - add DISCORD_WEBHOOK_URL
- `/packages/api/src/lib/discord.ts` - new file for Discord utility
- `/packages/api/src/routes/auth.ts` - trigger notification on new user

## Environment variables needed
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
```

## Testing
- [ ] Test with valid webhook URL
- [ ] Test with invalid/missing webhook URL (should not break registration)
- [ ] Verify message appears in Discord channel
