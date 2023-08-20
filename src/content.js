// Note: in contrast to redirecting based on the window.location, as we do in the background
// script, instead here we're aiming to redirect based on the interaction just taken.
// Did the user just try to follow? Redirect to the profile.
// Did the user just try to boost or fav? Redirect to the post in question.
// We won't be reading window.location here, because there's no guarantee the user just
// interacted with the same item the window is navigated to.

const $mastodon = document.querySelector('#mastodon');
let LOCAL_DOMAIN = '';
let WEB_DOMAIN = '';

function logInfo(...data) {
  // eslint-disable-next-line no-console
  console.log('[INFO ] Mastodon Redirector:', ...data);
}

function logError(...data) {
  // eslint-disable-next-line no-console
  console.error('[ERROR] Mastodon Redirector:', ...data);
}

function getTargetUsername() {
  // First try the username meta tag. However, sometimes Mastodon
  // forgets (TODO: [clarification needed]) to inject it, so we fall back to the
  // username shown in the profile header
  return document.querySelector('meta[property="profile:username"]')?.getAttribute('content') || document.querySelector('.account__header .account__header__tabs__name small')?.innerText.substring(1);
}

function setInnerText(element, newText) {
  if (element.innerText !== newText) {
    element.innerText = newText;
  }
}

function processModalTwoColumn() {
  // This could be a profile URL or a post URL, depending on the interaction
  // by the user that made this modal pop up in the first place
  const $urlInput = document.querySelector('.modal-root .copypaste input[type="text"]');
  if (!$urlInput) {
    logError('$urlInput was not found');
    return;
  }

  // Get username
  let user = getTargetUsername();
  if (!user) {
    logError('The target username was not found');
    return;
  }

  const $choiceBox = $urlInput.closest('.interaction-modal__choices__choice');
  if (!$choiceBox) {
    logError('$choiceBox was not found');
    return;
  }

  const $existingParagraph = $choiceBox.querySelector('p');
  const $existingParagraphText = $existingParagraph.querySelector('span');
  const $existingHeaderText = $choiceBox.querySelector('h3 span');

  if (!$existingParagraph) {
    logError('$existingParagraph not found');
    return;
  }
  if (!$existingParagraphText) {
    logError('$existingParagraphText not found');
    return;
  }
  if (!$existingHeaderText) {
    logError('$existingHeaderText not found');
    return;
  }

  // Not configured? Show a notification.
  if (!WEB_DOMAIN) {
    setInnerText($existingParagraphText, 'Please configure the mastodon-profile-redirect browser extension to more easily follow this account, directly on your Mastodon instance.');
    $existingParagraph.style.display = '';
    return;
  }

  // Trim off @domain suffix in case it matches with LOCAL_DOMAIN. This due to https://github.com/mastodon/mastodon/issues/21469
  if (user.endsWith(`@${LOCAL_DOMAIN}`)) {
    user = user.substring(0, user.length - `@${LOCAL_DOMAIN}`.length);
  }

  // Change title to reflect user’s Masto instance
  setInnerText($existingHeaderText, `On ${LOCAL_DOMAIN}`);

  const urlInputValue = $urlInput.value;
  const isInteractingWithPost = urlInputValue.match(/[0-9]+$/) !== null;

  // Create/get "View Profile/Post" button
  let $viewButton = $choiceBox.querySelector('.mastodon-redirector__button');
  if ($viewButton === null) {
    $viewButton = document.createElement('a');
    $viewButton.classList.add('button', 'button--block', 'mastodon-redirector__button');
    $existingParagraph.insertAdjacentElement('beforebegin', $viewButton);
  }
  if (isInteractingWithPost) {
    // User trying to interact with a post, so redirect to the post rather than
    // the author's profile
    setInnerText($viewButton, 'View Post');
    const encodedTarget = encodeURIComponent(urlInputValue);
    const newUrl = `https://${WEB_DOMAIN}/authorize_interaction?uri=${encodedTarget}`;
    $viewButton.href = newUrl;
  } else {
    // User trying to interact with profile, so redirect to profile
    setInnerText($viewButton, 'View Profile');
    $viewButton.href = `https://${WEB_DOMAIN}/@${user}`;
  }

  // Hide the copy-paste-this paragraph
  $existingParagraph.style.display = 'none';
}

function processModalOneColumn() {
  // find modal root and login textbox
  const $modalRoot = document.querySelector('.modal-root');

  // TODO: replace hint text
}

function foundModalRoot($modalRoot) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (!mutation.addedNodes.length) return;

      // newer Mastodon instances have a one-column modal,
      // and others have a two-column modal.
      const isPopupOneColumn = !!$modalRoot.querySelector('.interaction-modal__login');
      const isPopupTwoColumn = !!$modalRoot.querySelector('.copypaste input[type="text"]');
      const isNotReady = $modalRoot.innerText === '';

      if (isPopupOneColumn) {
        logInfo('Found modal, one-column variant');
        processModalOneColumn();
      } else if (isPopupTwoColumn) {
        logInfo('Found modal, two-column variant');
        processModalTwoColumn();
      } else if (isNotReady) {
        logInfo('Found modal root but it has no content yet, waiting');
      } else {
        logError('The modal is unrecognized, cannot inject redirection');
      }
    });
  });

  observer.observe($modalRoot, { subtree: true, childList: true });
}

// detect if this page uses a custom mastodon flavour (usually flavour-glitch)
function getFlavour() {
  const flavourElement = document.querySelector('[class*=flavour-]');
  if (!flavourElement) {
    return null; // vanilla
  }

  const classes = Array.from(flavourElement.classList);
  const flavour = classes.find((c) => c.startsWith('flavour-')).replace(/^flavour-/, '');
  return flavour;
}

// get the localStorage key that describes home instance (depends on the flavour)
function getHomePersistenceKey() {
  const flavour = getFlavour();
  switch (flavour) {
    case null:
      return 'mastodon_home';
    case 'glitch':
      return 'flavours/glitch_home';
    default: {
      const errorText = `Couldn't provide the home persistence key for this instance, because the flavour was not recognized: ${flavour}`;
      logError(errorText);
      throw new Error(errorText);
    }
  }
}

// record the user's home instance in localStorage so that when the interaction modal shows,
// it will already be filled out.
// this only works on instances which use the one-column variant of the interaction modal.
function storeHome() {
  // FIXME: extension options may still be unconfigured
  // home instance domain may be stored already, but let's overwrite it, in case it's stale
  const newValue = LOCAL_DOMAIN;
  const key = getHomePersistenceKey();
  const existingValue = localStorage.getItem(key);
  if (existingValue !== null) {
    logInfo(`localstorage has home instance set to ${existingValue}, overwriting with ${newValue}`);
  }
  localStorage.setItem(key, newValue);
}

async function begin() {
  if ($mastodon) {
    logInfo('Mastodon Redirector is running.');

    const items = await chrome.storage.sync.get({
      local_domain: '',
      web_domain: '',
    });

    LOCAL_DOMAIN = items.local_domain;
    WEB_DOMAIN = items.web_domain || LOCAL_DOMAIN;

    storeHome();

    const $initialModalRoot = $mastodon.querySelector('.modal-root');
    if ($initialModalRoot) {
      foundModalRoot($initialModalRoot);
    } else {
      const observerModalRoot = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (!mutation.addedNodes.length) return;

          const $modalRoot = $mastodon.querySelector('.modal-root');

          if ($modalRoot) {
            observerModalRoot.disconnect();
            foundModalRoot($modalRoot);
          }
        });
      });

      observerModalRoot.observe($mastodon, { subtree: true, childList: true });
    }
  }
}

begin();
