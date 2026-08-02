import { conflict, notFound } from './errors.js';
export class LifecycleService {
  constructor({ store, clock = () => new Date(), minSeed = 0, maxSeed = 2_147_483_647, maxFeedbackCount = 20, logger } = {}) {
    this.store = store;
    this.clock = clock;
    this.minSeed = minSeed;
    this.maxSeed = maxSeed;
    this.maxFeedbackCount = maxFeedbackCount;
    this.logger = logger;
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
    const scenario = this.store.find(id);
    if (!scenario) throw notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    if (scenario.state === 'published') {
      throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only; use remix', { remix_endpoint: `/api/scenarios/${id}/remix` });
    }
    throw conflict('REVISION_REQUIRED', 'Legacy feedback endpoint is deprecated; call revise instead', {
      revise_endpoint: `/api/scenarios/${id}/revise`,
      state: scenario.state,
    });
  }

  async revise({ id, requestId, feedback, sourceContext, imageStyle, jobManager }) {
    const scenario = this.store.find(id);
    if (!scenario) throw notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    if (scenario.state === 'published') {
      throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only; create a remix instead', {
        remix_endpoint: `/api/scenarios/${id}/remix`,
      });
    }
    if (!['approved', 'rendered'].includes(scenario.state)) {
      throw conflict('APPROVAL_REQUIRED', 'Scenario must be approved or rendered before revision');
    }
    if (!Array.isArray(feedback) || feedback.length === 0) {
      throw conflict('REVISION_FEEDBACK_REQUIRED', 'Revision request requires non-empty feedback list');
    }
    if (feedback.length > this.maxFeedbackCount) {
      throw conflict('REVISION_FEEDBACK_LIMIT', `Revision supports at most ${this.maxFeedbackCount} feedback items`);
    }
    const revisionRequestId = requestId;
    if (scenario.state === 'rendered') {
      this.store.moveToLegacyStaging(id);
    }
    const revoked = await this.store.revokeApproval(id, { requestId: revisionRequestId, reason: 'revision' });
    const safeSourcePreview = (scenario.record.context || sourceContext || '').slice(0, 2000);
    const job = jobManager.enqueueRevision({
      scenarioId: id,
      scenarioPath: `${this.store.dataRoot}/scenarios/draft/${id}.json`,
      feedback,
      sourceContext: sourceContext || scenario.record.context || '',
      sourceContextPreview: safeSourcePreview,
      requestId: revisionRequestId,
      revisionKind: 'standard',
    });
    this.logger?.info('revision.requested', {
      request_id: requestId,
      scenario_id: id,
      revision_request_id: revisionRequestId,
      revision_source: scenario.state,
      feedback_count: Array.isArray(feedback) ? feedback.length : 0,
      job_id: job.id,
    });
    return { record: revoked.record, job };
  }

  remix(sourceId, overrides = {}, { requestId } = {}) {
    const result = this.store.createRemix(sourceId, overrides);
    this.logger?.info('remix.created', {
      request_id: requestId,
      scenario_id: result.record.id,
      source_id: sourceId,
    });
    return { record: result.record, path: result.path };
  }

  renderPolicy(id, mode) {
    const candidate = this.store.find(id);
    if (!candidate) throw notFound('SCENARIO_NOT_FOUND', 'Scenario not found');
    if (candidate.state === 'published') throw conflict('PUBLISHED_IMMUTABLE', 'Published scenarios are read-only; create a remix', { remix_endpoint: `/api/scenarios/${id}/remix` });
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
