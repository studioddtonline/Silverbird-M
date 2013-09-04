var ThemeManager = {
  timeoutAutoFit: 0,
  timeout: 0,
  init: function () {
    ThemeManager.isPopup = (location.search === '?popup');
    ThemeManager.isDetached = (location.search === '?detached');
    $("link").find(".theme").remove();
    var theme = OptionsBackend.get('theme'), appendElement = '';
    $.each(theme.split(","), function(i, p) {
      appendElement += '<link rel="stylesheet" type="text/css" class="theme" href="' + p + '">';
    });
    if(!ThemeManager.isPopup) appendElement += '<base target="_blank">';
    $(document.head).append($.parseHTML(appendElement));
    var baseStyle = $("#base_stylesheet")[0];
    if(baseStyle.sheet && baseStyle.sheet.cssRules) {
      var baseRules = baseStyle.sheet.cssRules;
      var fontFamily = OptionsBackend.get('font_family');
      var fontSize = OptionsBackend.get('font_size');
      for(var i = 0, len = baseRules.length; i < len; ++i) {
        var rule = baseRules[i];
        if(rule.selectorText == ".tweet") {
          rule.style.fontFamily = fontFamily;
          rule.style.fontSize = fontSize;
          break;
        }
      }
    }

    var persistedPosition = Persistence.windowPosition();
    ThemeManager.detachedPos = persistedPosition.val();
    if(!ThemeManager.detachedPos) {
      // Setting default values
      ThemeManager.detachedPos = {
        left: 100,
        top: 100,
        height: null,
        width: null
      };
      persistedPosition.save(ThemeManager.detachedPos);
    }
    if(ThemeManager.isDetached) {
      $("#detach_trigger").remove();
      // Listening to resize and move events
      $(window).resize(function() {
        ThemeManager.detachedPos.height = window.innerHeight;
        ThemeManager.detachedPos.width = window.innerWidth;
        persistedPosition.save(ThemeManager.detachedPos);
      });
      setInterval(function() {
        if(ThemeManager.detachedPos.left != window.screenLeft || ThemeManager.detachedPos.top != window.screenTop) {
          ThemeManager.detachedPos.left = window.screenLeft;
          ThemeManager.detachedPos.top = window.screenTop;
          persistedPosition.save(ThemeManager.detachedPos);
        }
      }, 1000);
    }
  },

  setPopupSize: function(width, height, autoFitWidth) {
    if(!ThemeManager.isPopup) {
      return;
    }

    /* HACK: Magic numbers */
    var hackBordersWidth = 15;
    var hackTabsAdditionalWidth = 40;
    var hackHeaderHeight = 75;
    var hackMinValidHeight = 400;

    width = width || 490;
    height = height || 400;
    var minWidth = 450;
    var maxWidth = 800 - hackBordersWidth;
    if(width > maxWidth) {
      width = maxWidth;
    }
    if(width < minWidth) {
      width = minWidth;
    }
    if(autoFitWidth) {
      if(this.timeoutAutoFit > 0) clearTimeout(this.timeoutAutoFit);
      this.timeoutAutoFit = setTimeout(function(self) {
        var tabsBarWidth = 0;
        $(".timeline_tab").each(function() {
          tabsBarWidth += $(this).width();
        });
        tabsBarWidth += hackTabsAdditionalWidth;
        if(tabsBarWidth > width) {
          ThemeManager.setPopupSize(tabsBarWidth, height);
        }
        self.timeoutAutoFit = 0;
      }, 0, this);
    }

    var tabs = $("#tabs"), divTl = tabs.find(".timeline");
    divTl.width(width + 'px').height(height + 'px');
    tabs.find(".inner_timeline").height(height + 'px');

    if(this.timeout > 0) clearTimeout(this.timeout);
    this.timeout = setTimeout(function(self) {
      if(window.innerHeight < hackMinValidHeight) { return; }
      if(window.innerHeight < (divTl.height() + hackHeaderHeight)) {
        var height = window.innerHeight - hackHeaderHeight;
        ThemeManager.setPopupSize(width, height, autoFitWidth);
      }
      self.timeout = 0;
    }, 0, this);
  },

  popupSizeData: Persistence.popupSize(),

  initWindowResizing: function(context) {
    ThemeManager.handleWindowResizing();
    var tabs = $("#tabs"), divTl = context || tabs.find(".timeline").not(".ui-resizable-handle");
    if(!ThemeManager.isPopup) {
      var resizeFunc = function() {
        var timelineHeight = window.innerHeight - 79;
        divTl.css('maxHeight', timelineHeight + 'px');
        tabs.find(".inner_timeline").css('maxHeight', timelineHeight + 'px');
      };
      $(window).resize(resizeFunc);
      resizeFunc();
      return;
    }
    divTl.resizable({
      handles: 'e, s, se',
      minWidth: 450,
      resize: function(e, ui) {
        var $this = $(this);
        ThemeManager.setPopupSize($this.width(), $this.height());
      },
      stop: function(e, ui) {
        var $this = $(this);
        ThemeManager.popupSizeData.save([$this.width(), $this.height()].join('x'));
      }
    });
    tabs.find(".ui-resizable-handle")
    .attr('title', chrome.i18n.getMessage("resetSize"))
    .dblclick(function(e) {
      ThemeManager.popupSizeData.remove();
      ThemeManager.setPopupSize(null, null, true);
    });
  },

  handleWindowResizing: function() {
    var sizeArray = ThemeManager.popupSizeData.val();
    if(sizeArray) {
      sizeArray = sizeArray.split('x');
      ThemeManager.setPopupSize(sizeArray[0], sizeArray[1], true);
    } else {
      ThemeManager.setPopupSize(null, null, true);
    }
  },

  sortableEl: null,
  uiTabs: null,
  handleSortableTabs: function() {
    this.uiTabs = $("#tabs");
    this.sortableEl = this.uiTabs.find(".ui-tabs-nav");
    this.sortableEl.sortable({
      stop: function(event, ui) {
        ThemeManager.updateTabsOrder();
      }
    });
  },

  reOrderPanels: function(sortedTimelines) {
    var panels = $("#tabs").find(".ui-tabs-panel");
    for(var i = 0, len = sortedTimelines.length; i < len; ++i) {
      var correctTimeline = sortedTimelines[i];
      var correctPanel = $("#timeline-" + correctTimeline);
      var positionPanel = panels.eq(i);
      if(correctPanel[0].id != positionPanel[0].id) {
        var correctInnerTl = correctPanel.find(".inner_timeline");
        var currentScroll = correctInnerTl.scrollTop();
        correctPanel.detach();
        positionPanel.before(correctPanel);
        correctInnerTl.scrollTop(currentScroll);
        panels = $("#tabs").find(".ui-tabs-panel");
      }
    }
  },

  updateTabsOrder: function() {
    var sortedTabs = this.sortableEl.sortable('toArray');
    var sortedTimelines = [];
    for(var i = 0; i < sortedTabs.length; ++i) {
      sortedTimelines[i] = sortedTabs[i].split('-')[1];
    }
    tweetManager.setTimelineOrder(sortedTimelines);
    this.reOrderPanels(sortedTimelines);
    this.uiTabs.tabs('refresh');
  }
};
