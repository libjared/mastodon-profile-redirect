const go = () => {
	chrome.storage.sync.get(
		{
			local_domain: '',
			web_domain: '',
		},
		function (items) {
			const LOCAL_DOMAIN = items.local_domain;
			const WEB_DOMAIN = items.web_domain || LOCAL_DOMAIN;

			if (!LOCAL_DOMAIN) {
				alert('Please go to options and set your LOCAL_DOMAIN first');
				return;
			}

			if (isViewingPost()) {
				/* https://front-end.social/authorize_interaction?uri=${encodeURIComponent(window.location.href)} */
				/* Navigating to this URL has different effects based on whether the target uri is a post vs a profile. */
				/* For post, it redirects as you'd expect. */
				/* For profile, it prompts to follow in a simple UI fitting for a popup. */

				/* Redirect to the post. */
				const encodedTarget = encodeURIComponent(window.location.href);
				const newUrl = `https://${WEB_DOMAIN}/authorize_interaction?uri=${encodedTarget}`;
				window.location.href = newUrl;
			} else {
				let user = tryAndGetUserName();

				if (!user) return;

				/* Trim off @domain suffix in case it matches with LOCAL_DOMAIN. This due to https://github.com/mastodon/mastodon/issues/21469 */
				if (user.endsWith(`@${LOCAL_DOMAIN}`)) {
					user = user.substring(0, user.length - `@${LOCAL_DOMAIN}`.length);
				}

				/* Redirect to the profile. */
				window.location.href = `https://${WEB_DOMAIN}/@${user}`;
			}

			function isViewingPost() {
				const type = document.querySelector('meta[property="og:type"]');
				if (type === null) {
					// shrug!
					return false;
				}
				return type.content === 'article';
			}

			function tryAndGetUserName() {
				/* Profile with a moved banner (e.g. https://mastodon.social/@bramus): follow that link */
				const userNewProfile = document.querySelector('.moved-account-banner .button')?.getAttribute('href');
				if (userNewProfile) {
					return userNewProfile.substring(2);
				}

				/* Profile page, e.g. https://fediverse.zachleat.com/@zachleat and https://front-end.social/@mia */
				/* First try the username meta tag. However, sometimes Mastodon forgets to inject it, so we fall back to the username shown in the profile header */
				const userFromProfilePage = document.querySelector('meta[property="profile:username"]')?.getAttribute('content') || document.querySelector('.account__header .account__header__tabs__name small')?.innerText.substring(1);
				if (userFromProfilePage) {
					/* Don’t return if already watching on own LOCAL_DOMAIN instance */
					if (window.location.host === LOCAL_DOMAIN) return null;
					return userFromProfilePage;
				}

				/* Message detail, e.g. https://front-end.social/@mia/109348973362020954 and https://bell.bz/@andy/109392510558650993 and https://bell.bz/@andy/109392510558650993 */
				const userFromDetailPage = document.querySelector('.detailed-status .display-name__account')?.innerText;
				if (userFromDetailPage) return userFromDetailPage.substring(1);

				return null;
			}
		}
	);
};

chrome.action.onClicked.addListener((tab) => {
	if (!tab.url.includes('chrome://')) {
		chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: go,
		});
	}
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
	if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
		chrome.runtime.openOptionsPage();
	}
});
