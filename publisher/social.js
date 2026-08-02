// publisher/social.js — постинг в соцсети (Twitter/X, Mastodon)
import path from 'path';
import { fileURLToPath } from 'url';

export async function postTwitter(text, mediaPath) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.warn('TWITTER_BEARER_TOKEN not set, skipping');
    return { skipped: true };
  }
  // TODO: реализовать через Twitter API v2 + media upload
  console.log(`[Twitter placeholder] Would post: ${text}`);
  return { platform: 'twitter', text };
}

export async function postMastodon(text, mediaPath) {
  const instance = process.env.MASTODON_INSTANCE;
  const token = process.env.MASTODON_TOKEN;
  if (!instance || !token) {
    console.warn('Mastodon creds not set, skipping');
    return { skipped: true };
  }
  // TODO: реализовать через Mastodon API
  console.log(`[Mastodon placeholder] Would post to ${instance}: ${text}`);
  return { platform: 'mastodon', text };
}

export async function publishSocial(comicPath, meta = {}) {
  const text = `🎨 Новый комикс: ${meta.title || 'без названия'}`;
  const results = [];
  try { results.push(await postTwitter(text, comicPath)); } catch (e) { console.error('Twitter:', e); }
  try { results.push(await postMastodon(text, comicPath)); } catch (e) { console.error('Mastodon:', e); }
  return results;
}