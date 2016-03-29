"use strict";
// require("jquery");
const Validator = class Validator {
  static global() {
    var atLeastOneVisible = false;
    $("input[type='checkbox']").each(function() {
      var isVisibleCheck = $(this).attr('name').match(/_visible$/);
      if(isVisibleCheck) {
        var checked = $(this).is(":checked");
        if(checked) {
          atLeastOneVisible = true;
          return false;
        }
      }
    });
    if(!atLeastOneVisible) {
      return 'You should select at least one timeline as visible.';
    }
    return true;
  }

  static required ($el) {
    var val = $el.val();
    if(!val)
      return 'It can\'t be empty.';
    return true;
  }

  static number ($el) {
    var intVal = parseInt($el.val(), 10);
    if(isNaN(intVal))
      return 'It should be a number.';
    return true;
  }

  static positive ($el) {
    if(parseInt($el.val(), 10) <= 0)
      return 'It should be positive.';
    return true;
  }

  static minRefresh ($el) {
    if(parseInt($el.val(), 10) < 90)
      return 'Minimum interval is 90s';
    return true;
  }

  static minAlarm ($el) {
    if(parseInt($el.val(), 10) < 3)
      return 'Minimum interval is 3m';
    return true;
  }

  static url ($el) {
    if($el.val().match(/(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/i)) {
      return true;
    }
    return 'It should be a valid URL.';
  }

  static maxTweetsPerRequest ($el) {
    if(parseInt($el.val(), 10) > 200)
      return 'Maximum value is 200';
    return true;
  }

  static maxTweetsOnTimeline ($el) {
    if(parseInt($el.val(), 10) > 200)
      return 'Maximum value is 200';
    return true;
  }

  static unifiedValidator($el) {
    if(!$el.is(":checked")) {
      return true;
    }
    var atLeastOneSelected = false;
    $("input[type='checkbox']").each(function() {
      var isIncludeUnifiedCheck = $(this).attr('name').match(/include_unified$/);
      if(isIncludeUnifiedCheck) {
        var checked = $(this).is(":checked");
        if(checked) {
          atLeastOneSelected = true;
          return false;
        }
      }
    });
    if(!atLeastOneSelected) {
      return 'You should select at least one timeline to compose the unified timeline.';
    }
    return true;
  }
}
