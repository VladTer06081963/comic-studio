import { conflict, notFound } from './errors.js';

export class LifecycleService {
  constructor({ store, clock = () => new Date(), minSeed = 0, maxSeed = 2_147_483_647 } = {}) {
    this.store = store;
    this.clock = clock;
    this.minSeed = minSeed;
    this.maxSeed = maxSeed;
  }

  approve(id) {
    return this.store.transition(id, 'draft', 'approved');
  }

  reject(id) {
    return this.store.transition(id, 'draft', 'rejected');
  }

  async setSeed(id, value) {
    return this.store.update(id, (record, state) => {
      if (state === 'published') throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only');
      if (!['draft', 'approved'].includes(state)) {
        throw conflict('SEED_REQUIRES_RERENDER', 'Rendered seed can only change as part of rerender');
      }
      record.seed = value;
      record.seed_updated_at = this.clock().toISOString();
      return record;
    });
  }

  async recordFeedback(id, text) {
    return this.store.update(id, (record, state) => {
      if (state === 'published') throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only; create a remix');
      record.feedback = Array.isArray(record.feedback) ? record.feedback : [];
      record.feedback.push({ ts: this.clock().toISOString(), text, source: 'web-ui', status: 'pending_revision' });
      record.revision_status = 'feedback_recorded';
      return record;
    });
  }

  renderPolicy(id, mode) {
    const candidate = this.store.find(id);
    if (!candidate) throw notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    if (candidate.state === 'published') throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only; create a remix');
    if (candidate.state === 'draft' || candidate.state === 'rejected') {
      throw conflict('APPROVAL_REQUIRED', 'Scenario must be approved before render');
    }
    if (candidate.state === 'approved' && mode !== 'initial') {
      throw conflict('INVALID_RENDER_MODE', 'Approved scenarios require initial render mode');
    }
    if (candidate.state === 'rendered' && mode !== 'rerender') {
      throw conflict('RERENDER_CONFIRMATION_REQUIRED', 'Rendered scenarios require explicit rerender mode');
    }
    return candidate;
  }
}
