const browserAPI = chrome;
const stylesheet = new CSSStyleSheet();

document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet];

const elementsInformation = {
    shortsContainerId: "div#contents",
    shortsSectionChildTag: "ytd-reel-shelf-renderer",
    shortsSectionMainTag: "ytd-rich-section-renderer",
}

const events = {
    TAB_CHANGED: "TAB_CHANGED",
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
    GET_SETTINGS: "GET_SETTINGS"
}

function hideShortsPanel() {
    if(!stylesheet) return;
    if(stylesheet.cssRules.length) return;
    stylesheet.insertRule(`${elementsInformation.shortsContainerId} ${elementsInformation.shortsSectionChildTag}, ${elementsInformation.shortsContainerId} ${elementsInformation.shortsSectionMainTag} {display: none}`,0)
    return;
}

function unHideShortsPanel(){
    if(!stylesheet) return;
    if(stylesheet.cssRules.length) stylesheet.deleteRule(0)
    return;
}


function getSettings() {
    browserAPI.runtime.sendMessage({ type: events.GET_SETTINGS }, (response) => {
        
        const { status, data } = response;
        if (!status) return;
        const { selector } = data;
        if (!selector) return;

        switch (selector) {
            case "hideAll":
                hideShortsPanel();
                break;
            default:
                unHideShortsPanel();
                break;
        }

        return;

    });

    return;
}



browserAPI.runtime.onMessage.addListener((msg, sender, sendMessage) => {
    sendMessage('PONG');
    switch (msg.type) {
        case events.TAB_CHANGED:
        case events.SETTINGS_CHANGED:
            getSettings();
            break;
        default:
            break;
    }
})

getSettings();