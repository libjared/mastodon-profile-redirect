const $mastodon = document.querySelector('#mastodon');
let LOCAL_DOMAIN = '';
let WEB_DOMAIN = '';

if ($mastodon) {
	console.log('Mastodon Redirector is running.');

	chrome.storage.sync.get(
		{
			local_domain: '',
			web_domain: '',
		},
		function (items) {
			LOCAL_DOMAIN = items.local_domain;
			WEB_DOMAIN = items.web_domain || LOCAL_DOMAIN;

			const $initialModalRoot = $mastodon.querySelector('.modal-root');
			if ($initialModalRoot) {
				foundModalRoot($initialModalRoot);
			} else {
				const observerModalRoot = new MutationObserver(function (mutations_list) {
					mutations_list.forEach(function (mutation) {
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
	);
}

function foundModalRoot($modalRoot) {
	const observer = new MutationObserver(function (mutations_list) {
		mutations_list.forEach(function (mutation) {
			if (!mutation.addedNodes.length) return;

			console.log(`Observer found ${mutation.addedNodes.length} new nodes`, mutation.addedNodes);

			// This could be a profile URL or a post URL, depending on the interaction
			// by the user that made this modal pop up in the first place
			const $urlInput = document.querySelector('.modal-root .copypaste input[type="text"]');
			if (!$urlInput) return;

			// Get username
			// First try the username meta tag. However, sometimes Mastodon forgets to inject it,
			// so we fall back to the username shown in the profile header
			let user = document.querySelector('meta[property="profile:username"]')?.getAttribute('content') || document.querySelector('.account__header .account__header__tabs__name small')?.innerText.substring(1);
			if (!user) return;

			$choiceBox = $urlInput.closest('.interaction-modal__choices__choice');
			if (!$choiceBox) return;

			const $existingParagraph = $choiceBox.querySelector('p');
			const $existingHeader = $choiceBox.querySelector('h3 span');

			if (!$existingParagraph) {
				console.error(`$existingParagraph not found`);
			}
			if (!$existingHeader) {
				console.error(`$existingHeader not found`);
			}

			// Not configured? Show a notification.
			if (!WEB_DOMAIN) {
				const newText = 'Please configure the mastodon-profile-redirect browser extension to more easily follow this account, directly on your Mastodon instance.';
				if ($existingParagraph.innerText !== newText) {
					$existingParagraph.innerText = newText;
				}
				return;
			}

			// Trim off @domain suffix in case it matches with LOCAL_DOMAIN. This due to https://github.com/mastodon/mastodon/issues/21469
			if (user.endsWith(`@${LOCAL_DOMAIN}`)) {
				user = user.substring(0, user.length - `@${LOCAL_DOMAIN}`.length);
			}

			// Change title to reflect user’s Masto instance
			const newText = `On ${LOCAL_DOMAIN}`;
			if ($existingHeader.innerText !== newText) {
				$existingHeader.innerText = newText;
			}

			// Note: in contrast to redirecting based on the window.location, as we do in the background script, instead here we're aiming to redirect based on the interaction just taken.
			// Did the user just try to follow? Redirect to the profile.
			// Did the user just try to boost or fav? Redirect to the post in question.
			// We won't be reading window.location here, because there's no guarantee the user just interacted with the same item the window is navigated to.
			const urlInputValue = $urlInput.value;
			const isInteractingWithPost = urlInputValue.match(/[0-9]+$/) !== null;

			// Create view profile/post button
			const $viewButton = document.createElement('a');
			$viewButton.classList.add('button', 'button--block');
			if (isInteractingWithPost) {
				// User trying to interact with a post, so redirect to the post rather than the author's profile
				$viewButton.innerText = 'View Post';
				const encodedTarget = encodeURIComponent(urlInputValue);
				const newUrl = `https://${WEB_DOMAIN}/authorize_interaction?uri=${encodedTarget}`;
				$viewButton.href = newUrl;
			} else {
				// User trying to interact with profile, so redirect to profile
				$viewButton.innerText = 'View Profile';
				$viewButton.href = `https://${WEB_DOMAIN}/@${user}`;
			}

			// Replace the orig paragraph with the show profile button
			$existingParagraph.insertAdjacentElement('beforebegin', $viewButton);
			$choiceBox.removeChild($existingParagraph);
		});
	});

	observer.observe($modalRoot, { subtree: true, childList: true });
}
