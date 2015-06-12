function DMTweetsTimeline(timelineId, manager, template) {
  TweetsTimeline.call(this, timelineId, manager, template);
}

$.extend(DMTweetsTimeline.prototype, TweetsTimeline.prototype, {
  /* overridden */
  _doBackendRequest: function(path, callback, context, params) {
    params.full_text = 'true';
    this.manager.twitterBackend.timeline(path, callback, context, params);
  }
});
