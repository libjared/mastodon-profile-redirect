const isMostLikelyMastodon = document.querySelector('#mastodon');

if (isMostLikelyMastodon) {
	const $modalRoot = document.querySelector('.modal-root');

	if ($modalRoot) {
		const observer = new MutationObserver(function (mutations_list) {
			mutations_list.forEach(function (mutation) {
				if (!mutation.addedNodes.length) return;

				const $profileUrlInput = document.querySelector('.modal-root .copypaste input[type="text"]');
				if (!$profileUrlInput) return;

				// Get username
				// First try the username meta tag. However, sometimes Mastodon forgets to inject it,
				// so we fall back to the username shown in the profile header
				let user = document.querySelector('meta[property="profile:username"]')?.getAttribute('content') || document.querySelector('.account__header .account__header__tabs__name small')?.innerText.substring(1);
				if (!user) return;

				$choiceBox = $profileUrlInput.closest('.interaction-modal__choices__choice');
				if (!$choiceBox) return;

				if ($choiceBox.dataset.redirectModificationsState !== 'done') {
					const $existingParagraph = $choiceBox.querySelector('p');
					const $existingHeader = $choiceBox.querySelector('h3 span');

					chrome.storage.sync.get(
						{
							local_domain: '',
							web_domain: '',
						},
						function (items) {
							const LOCAL_DOMAIN = items.local_domain;
							const WEB_DOMAIN = items.web_domain || LOCAL_DOMAIN;

							// Not configured? Show a notification.
							if (!WEB_DOMAIN && $choiceBox.dataset.redirectModificationsState !== 'unconfigured') {
								$existingParagraph.innerText = 'Please configure the mastodon-profile-redirect browser extension to more easily follow this account, directly on your Mastodon instance.';
								$choiceBox.dataset.redirectModificationsState = 'unconfigured';
								return;
							}

							// Trim off @domain suffix in case it matches with LOCAL_DOMAIN. This due to https://github.com/mastodon/mastodon/issues/21469
							if (user.endsWith(`@${LOCAL_DOMAIN}`)) {
								user = user.substring(0, user.length - `@${LOCAL_DOMAIN}`.length);
							}

							// Change title to reflect user’s Masto instance
							$existingHeader.innerText = `On ${LOCAL_DOMAIN}`;

							const pageType = document.querySelector('meta[property="og:type"]');
							const isViewingPost = pageType !== null && pageType.content === 'article';

							// Create view profile button
							const $viewButton = document.createElement('a');
							$viewButton.classList.add('button', 'button--block');
							if (isViewingPost) {
								$viewButton.innerText = 'View Post';
								const encodedTarget = encodeURIComponent(window.location.href);
								const newUrl = `https://${WEB_DOMAIN}/authorize_interaction?uri=${encodedTarget}`;
								$viewButton.href = newUrl;
							} else {
								$viewButton.innerText = 'View Profile';
								$viewButton.href = `https://${WEB_DOMAIN}/@${user}`;
							}

							// Replace the orig paragraph with the show profile button
							$existingParagraph.insertAdjacentElement('beforebegin', $viewButton);
							$choiceBox.removeChild($existingParagraph);

							$choiceBox.dataset.redirectModificationsState = 'done';
						}
					);
				}
			});
		});

		observer.observe($modalRoot, { subtree: true, childList: true });
	}
}
