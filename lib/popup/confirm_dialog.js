var ConfirmDialog = {
  init: function() {
    $('#confirm_dialog').dialog({
      autoOpen: false,
      beforeClose: function(event, ui) {
        this.removeAttribute('data-tweet-action');
        this.removeAttribute('data-tweet-id');
        this.removeAttribute('data-tweet-option');
        this.textContent = '';
      },
      buttons: [
        {
          text: chrome.i18n.getMessage('Yes'),
          click: function() {
            switch(this.dataset.tweetAction) {
              case 'retweet':
                Composer.confirmRT(this.dataset.tweetId);
                break;
              case 'destroy':
                Composer.confirmDestroy(this.dataset.tweetId, this.dataset.tweetOption);
                break;
              default:
                break;
            }
            $(this).dialog('close');
          }
        },
        {
          text: chrome.i18n.getMessage('No'),
          click: function() {
            $(this).dialog('close');
          }
        }
      ],
      closeOnEscape: OptionsBackend.get('use_keyboard_shortcuts'),
      dialogClass: 'ui-dialog',
      draggable: false,
      minHeight: 100,
      modal: true
    });
  }
};
