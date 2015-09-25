"use strict";
class UnifiedDMsTweetsTimeline extends UnifiedTweetsTimeline {
  constructor(timelineId, manager, template, timelines) {
    super(timelineId, manager, template, timelines);
  }
  /* overridden */
  _shouldIncludeTemplate(template) {
    return template.id == TimelineTemplate.RECEIVED_DMS || template.id == TimelineTemplate.SENT_DMS;
  }
}
