"use strict";
class DMTweetsTimeline extends TweetsTimeline {
  constructor(timelineId, manager, template) {
    super(timelineId, manager, template);
  }
  /* overridden */
  _doBackendRequest(path, callback, context, params) {
    const now = Date.now();
    if(now - this.lastRequestedTime < 5 * 30 * 1000) {
      callback(true, [], undefined, context);
      return;
    }
    this.lastRequestedTime = now;
    params.full_text = 'true';
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
}
