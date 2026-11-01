/**
 * Netlify Scheduled Function: removes expired daily videos.
 *
 * Netlify cron runs in UTC, so this does NOT try to fire "at Israeli
 * midnight". It sweeps every 10 minutes and acts only on records whose exact
 * expiresAt (midnight Asia/Jerusalem, stored at publication) has passed.
 * Visitors stop seeing a video at expiresAt regardless (server + client
 * checks); this job does the physical clean-up within ~10 minutes:
 *  - uploaded file: record removed (id-checked) and the Storage object deleted;
 *  - external link: record removed; nothing is deleted at the provider.
 * Failed deletions stay queued and are retried on the next run. Idempotent.
 * Scheduled functions run only on the published production deploy.
 */
import type { Config } from '@netlify/functions';
import { readConfig } from '../../server/config';
import { createStore } from '../../server/bootstrap';
import { ContentService } from '../../server/services/content';
import { ScheduleVideoService } from '../../server/services/schedule-video';

process.env.NODE_ENV ??= 'production';
process.env.DATA_MODE ??= 'production';
if (!process.env.PUBLIC_SITE_URL && process.env.URL) process.env.PUBLIC_SITE_URL = process.env.URL;

export default async (): Promise<void> => {
  const config = readConfig(process.env);
  const { store, video } = await createStore(config);
  const content = new ContentService(store);
  const service = new ScheduleVideoService(store, video, config.scheduleVideoMaxBytes, (e) => content.auditUpdate(e));
  const summary = await service.cleanup();
  console.log('[schedule-video-cleanup]', JSON.stringify(summary));
};

export const config: Config = {
  schedule: '*/10 * * * *',
};
