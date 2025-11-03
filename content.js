const browserAPI = chrome;
let observer;

const elementsInformation = {
    shortsContainerId: "div#contents",
    shortsSectionChildTag: "ytd-reel-shelf-renderer",
    shortsSectionMainTag: "ytd-rich-section-renderer",
}

const events = {
    TAB_CHANGED: "TAB_CHANGED",
    GET_SETTINGS: "GET_SETTINGS"
}

const URL_ENUM = {
    INVALID_URL: 0,
    MAIN_URL: 1,
    VIDEO_URL: 2
}

let UrlType = URL_ENUM.INVALID_URL;

//Observer
const config = { childList: true };

const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {

        const { target } = mutation;

        if (mutation.type === "childList") {
            console.log(target?.localName)
        }

    }
};

observer = new MutationObserver(callback);


function delay(s){ 
    return new Promise((resolve)=> setTimeout(resolve(1), s * 1000))
}

function getVideoUrlType(url) {
    return new Promise((resolve, _) => {

        const targetUrl = new URL(url);

        if (!targetUrl) resolve(URL_ENUM.INVALID_URL);

        const { pathname, hostname } = targetUrl;

        if (pathname.includes('watch')) resolve(URL_ENUM.VIDEO_URL);

        if (hostname.includes('youtube.com')) resolve(URL_ENUM.MAIN_URL);

    })
}

function hideShortsSection(shortsContainer, shortsSectionContainerTag) {
    const shortsSectionContainer = shortsContainer?.querySelectorAll(shortsSectionContainerTag);

    for (const shrts of shortsSectionContainer) {
        shrts.style.setProperty('display', 'none')
    }

}

async function processHidingShortsPanel() {
    UrlType = await getVideoUrlType(window.location.href);
    if (UrlType === URL_ENUM.INVALID_URL) return;

    await delay(5)

    const element = document.querySelector(`${elementsInformation.shortsContainerId}`);
    if (!element) return;

    console.log(element, UrlType);

    if (UrlType === URL_ENUM.MAIN_URL) hideShortsSection(element, elementsInformation.shortsSectionMainTag);

    if (UrlType === URL_ENUM.VIDEO_URL) hideShortsSection(element, elementsInformation.shortsSectionChildTag);

    // observer.observe(element, config);

    return;

}

function reset() {
    observer.disconnect();
}


function getSettings() {

    reset();

    browserAPI.runtime.sendMessage({ type: events.GET_SETTINGS }, (response) => {

        const { status, data } = response;
        if (!status) return;
        const { selector } = data;
        if (!selector) return;

        switch (selector) {
            case "hideAll":
                processHidingShortsPanel();
                break;
            default:
                break;
        }

        return;

    });

    return;
}



browserAPI.runtime.onMessage.addListener((msg, sender, sendMessage) => {
    sendMessage('PONG');
    getSettings();
})

getSettings();