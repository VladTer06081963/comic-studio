export const LIFECYCLE_CASES = Object.freeze([
  { from: 'draft', operation: 'approve', to: 'approved', allowed: true },
  { from: 'draft', operation: 'reject', to: 'rejected', allowed: true },
  { from: 'approved', operation: 'approve', to: 'approved', allowed: true, idempotent: true },
  { from: 'approved', operation: 'reject', allowed: false, code: 'INVALID_TRANSITION' },
  { from: 'rejected', operation: 'approve', allowed: false, code: 'INVALID_TRANSITION' },
  { from: 'published', operation: 'render', allowed: false, code: 'PUBLISHED_IMMUTABLE' },
  { from: 'draft', operation: 'render', allowed: false, code: 'APPROVAL_REQUIRED' },
  { from: 'rendered', operation: 'render', mode: 'initial', allowed: false, code: 'RERENDER_CONFIRMATION_REQUIRED' },
  { from: 'rendered', operation: 'render', mode: 'rerender', allowed: true },
]);
