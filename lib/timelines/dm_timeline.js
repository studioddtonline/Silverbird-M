"use strict";
class DMTweetsTimeline extends TweetsTimeline {
  constructor(timelineId, manager, template) {
    super(timelineId, manager, template);
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    params.full_text = 'true';
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
}
