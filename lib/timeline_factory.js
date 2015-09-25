"use strict";
/*
TimelineFactory contract:
 - TimelineFactory(Template)
 # create() -> [Timeline1, Timeline2]
 # addTimeline() -> Timeline
*/
class TimelineFactory {
  constructor(template) {
    this.tweetManager = template.tweetManager;
    this.template = template;
  }
  addTimeline() {
    /* Default addTimeline should do nothing */
    return null;
  }
}

/*
  Default Timeline Factory
*/
class DefaultTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible || this.template.includeInUnified) {
      return [new TweetsTimeline(this.template.id, this.tweetManager, this.template)];
    }
    return [];
  }
}

/*
  Regular DM Timeline Factory
*/
class DMTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible || this.template.includeInUnified || TimelineTemplate.getTemplate(TimelineTemplate.DMS).visible) {
      return [new DMTweetsTimeline(this.template.id, this.tweetManager, this.template)];
    }
    return [];
  }
}

/*
  Favorites Timeline Factory
*/
class FavoritesTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible || this.template.includeInUnified) {
      return [new FavoritesTweetsTimeline(this.template.id, this.tweetManager, this.template)];
    }
    return [];
  }
}

/*
  Unified Timeline Factory
*/
class UnifiedTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible) {
      return [new UnifiedTweetsTimeline(this.template.id, this.tweetManager, this.template, this.tweetManager.timelines)];
    }
    return [];
  }
}

/*
  DMs Unified Timeline Factory
*/
class UnifiedDMsTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible || this.template.includeInUnified) {
      return [new UnifiedDMsTweetsTimeline(this.template.id, this.tweetManager, this.template, this.tweetManager.timelines)];
    }
    return [];
  }
}

/*
  Multiple Timeline Factory - Base class for templates supporting multiple timelines
  (e.g. Lists, Search)
*/
class MultipleTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    if(this.template.visible) {
      var currentData = this.template.getUserData();
      if(!currentData || currentData.length === 0) {
        currentData = [null];
      }
      this.template.setUserData(currentData);
      var ret = [];
      for(var i = 0, len = currentData.length; i < len; ++i) {
        ret.push(this._instantiateTimeline(this.template.id + '_' + i, this.tweetManager, this.template, currentData[i], i));
      }
      return ret;
    }
    return [];
  }
  addTimeline(uniqueId) {
    var currentData = this.template.getUserData();
    if(!currentData) {
      currentData = [];
    }
    currentData.push(null);
    this.template.setUserData(currentData);
    var index = currentData.length - 1;
    var timeline = this._instantiateTimeline(this.template.id + '_' + uniqueId, this.tweetManager, this.template, currentData[index], index);
    return timeline;
  }
  _instantiateTimeline(timelineId, manager, template, data, orderNumber) {
    throw '_instantiateTimeline must be overridden';
  }
}

/*
  Lists Timeline Factory
*/
class ListsTimelineFactory extends MultipleTimelineFactory {
  constructor(template) {
    super(template);
  }
  _instantiateTimeline(timelineId, manager, template, data, orderNumber) {
    return new ListsTweetsTimeline(timelineId, manager, template, data, orderNumber);
  }
}

/*
  Search Timeline Factory
*/
class SearchTimelineFactory extends MultipleTimelineFactory {
  constructor(template) {
    super(template);
  }
  _instantiateTimeline(timelineId, manager, template, data, orderNumber) {
    return new SearchTweetsTimeline(timelineId, manager, template, data, orderNumber);
  }
}

/*
  Notification Timeline Factory
*/
class NotificationTimelineFactory extends TimelineFactory {
  constructor(template) {
    super(template);
  }
  create() {
    return [new NotificationTimeline(this.template.id, this.tweetManager, this.template)];
  }
}
