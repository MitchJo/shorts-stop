const browserAPI = chrome;

const shortsUrl = "youtube.com/shorts/";

const keys = {
    blockPath: shortsUrl,
    timeLimit: "timeLimit",
    watchedData: "watchedData",
    hideAll: "hideAll"
}

const events = {
    GET_SETTINGS: "GET_SETTINGS",
    LIMIT_SHORTS: "LIMIT_SHORTS",
    BLOCK_ALL: "BLOCK_ALL",
    HIDE_ALL: "HIDE_ALL",
    TAB_CHANGED: "TAB_CHANGED",
    SETTINGS_CHANGED: "SETTINGS_CHANGED"
}

function getTimeLimitData() {

    return new Promise((resolve, reject) => {

        browserAPI.storage.local.get(keys.timeLimit)
            .then(s => {
                if (!s[keys.timeLimit]) reject(null)
                resolve(s[keys.timeLimit])
            })
            .catch(_ => {
                reject(null)
            })

    })

}

function getWatchedData() {
    return new Promise((resolve, _) => {

        browserAPI.storage.local.get(keys.watchedData)
            .then(s => {
                if (!s[keys.watchedData]) resolve({ lastWatchedTime: 0, remaining: 0 })
                resolve(s[keys.watchedData])
            })
            .catch(e => {
                // console.log(e.message);
                resolve({ lastWatchedTime: 0, remaining: 0 })
            })

    })
}

function setWatchedData(data) {
    return new Promise((resolve, reject) => {

        browserAPI.storage.local.set({ [keys.watchedData]: data })
            .then(s => resolve(s))
            .catch(e => reject(e))

    })
}

function getVideoUrl(url) {
    return new Promise((resolve, _) => {

        const targetUrl = new URL(url);

        if (!targetUrl) resolve(undefined);
        if (!targetUrl.hostname.includes('youtube.com')) resolve(undefined);
        if (targetUrl.pathname.length <= 1) resolve(undefined);

        if (targetUrl.pathname.includes('shorts')) resolve(shortsUrl);

        if (!targetUrl.pathname.includes('watch')) resolve(url);

        for (const [k, _] of targetUrl.searchParams) { if (k !== 'v') setTimeout(() => targetUrl.searchParams.delete(k)) }
        setTimeout(() => resolve(targetUrl.toString()));

    })
}

function isUrlBlocked(targetUrl) {

    return new Promise((resolve, _) => {
        browserAPI.declarativeNetRequest.getDynamicRules(rules => {
            const match = rules.find(rule => {
                return rule.condition?.urlFilter === targetUrl;
            });
            resolve(!!match);
        });
    });

}

function unblock(path) {

    return new Promise((resolve, reject) => {

        browserAPI.storage.local.get(path, data => {
            const ruleId = data[path]
            if (ruleId) {

                browserAPI.declarativeNetRequest.updateDynamicRules({
                    addRules: [],
                    removeRuleIds: [ruleId]
                }, () => {
                    browserAPI.storage.local.remove(path);
                    resolve({ status: true, message: "Successfully unblock path." });
                });
                
            } else {
                reject({ success: false, message: 'No such path.' });
            }

        });
    })
}

function blockUrl(url) {
    return new Promise((resolve, _) => {

        try {
            browserAPI.storage.local.remove(keys.timeLimit)
            browserAPI.storage.local.remove(keys.watchedData)
            browserAPI.storage.local.remove(keys.hideAll)
        } catch (e) { }

        const ruleId = Math.floor(Date.now() % 1000000);

        browserAPI.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: ruleId,
                priority: 1,
                action: {
                    type: "redirect",
                    redirect: {
                        extensionPath: "/blocked.html"
                    }
                },
                condition: {
                    urlFilter: url,
                    resourceTypes: ["main_frame"]
                }
            }],
            removeRuleIds: []
        },

            () => {

                try {
                    browserAPI.storage.local.set({ [url]: ruleId });
                    resolve({ success: true, message: 'URL blocked.' });
                } catch (e) {
                    resolve({ success: false, message: e.message || "An error occurred." })
                }

            })

    });
}

function hideAllShorts() {
    return new Promise((resolve, reject) => {
        unblock(shortsUrl).then(_ => { }).catch(_ => { });

        try {
            browserAPI.storage.local.remove(keys.timeLimit)
            browserAPI.storage.local.remove(keys.watchedData)
        } catch (_) { }

        try {
            browserAPI.storage.local.set({ [keys.hideAll]: true })
            resolve({ status: true, message: 'Shorts hidden.' })
        } catch (e) {
            reject({ status: false, message: e.message || 'Cannot save.' })
        }

    })
}


function saveTimeLimit(data) {
    return new Promise((resolve, reject) => {

        browserAPI.storage.local.set({ [keys.timeLimit]: data })
            .then(s => {
                resolve({ status: true, message: "Time limit saved successfully." })
            })
            .catch(e => {
                reject({ status: true, message: e.message || "Could not save Time limit." });
            })

    })
}

function limitShorts(data) {
    return new Promise(async (resolve, reject) => {
        unblock(shortsUrl).then(_ => { }).catch(_ => { })

        try {
            browserAPI.storage.local.remove(keys.hideAll)
        } catch (_) { }

        saveTimeLimit(data)
            .then(s => {

                setWatchedData({ lastWatchedTime: 0, expectedResetTime: 0, remaining: data?.amount || 0 })
                    .then(s => resolve(s))
                    .catch(e => reject(e))

            })
            .catch(e => reject(e))

    })
}

function processLimiter(tabId) {
    return new Promise(async (resolve, _) => {

        const timeLimitData = await getTimeLimitData();
        if (!timeLimitData) resolve(null);

        const { amount, totalMinutes } = timeLimitData;
        const { expectedResetTime = 0, remaining } = await getWatchedData();

        let shortsWatched = (remaining < 0 ? 1 : remaining) - 1;
        const currentTime = Date.now();

        let newResetTime = expectedResetTime;

        if (currentTime > expectedResetTime) {
            newResetTime = currentTime + (totalMinutes * 60000);
            shortsWatched = amount;
        }

        await setWatchedData({
            lastWatchedTime: currentTime,
            expectedResetTime: newResetTime,
            remaining: shortsWatched
        })

        if (shortsWatched < 1) {
            const redirectUrl = browserAPI.runtime.getURL("warning.html");
            browserAPI.tabs.update(tabId, { url: redirectUrl });
        }

        resolve(true);


    })
}

function getSettingsData() {
    return new Promise(async (resolve, reject) => {

        try {
            const hideAllResponse = await browserAPI.storage.local.get(keys.hideAll);
            if(hideAllResponse[keys.hideAll]) resolve({ status: true, data: { selector: 'hideAll' } })
        } catch (e) { }


        try {
            const blockAllResponse = await  browserAPI.storage.local.get(shortsUrl);
            if(blockAllResponse[shortsUrl]) resolve({ status: true, data: { selector: 'blockAll' } })
        } catch (e) { }


        const timeLimitDataResponse = await getTimeLimitData().then(s=>s).catch(_=>null);
         if (!timeLimitDataResponse) reject({ status: false, message: 'N/A' })

        const watchedDataResponse =  await getWatchedData().then(w => w).catch(_ => null);

        if(watchedDataResponse) resolve({ status: true, data: { selector: 'timeLimit', timeData: timeLimitDataResponse, watchedData: watchedDataResponse } })

        if(!watchedDataResponse) reject({ status: false, message: 'N/A' })

    })

}


function broadcastSettingsChanges() {

    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if(tabs[0]?.id) browserAPI.tabs.sendMessage(tabs[0]?.id, { type: events.SETTINGS_CHANGED }).then(_=>{}).catch(_=>{})
    })

}

browserAPI.runtime.onMessage.addListener((msg, sender, sendMessage) => {

    switch (msg.type) {
        case events.GET_SETTINGS:
            getSettingsData()
                .then(s => sendMessage(s))
                .catch(e => sendMessage(e))
            break
        case events.LIMIT_SHORTS:
            limitShorts(msg.data)
                .then(_ => {
                    sendMessage({ status: true, message: "Successfully limited Youtube Shorts." })
                    broadcastSettingsChanges()
                })
                .catch(e => sendMessage({ status: false, message: e.message || 'Cannot Limit.' }))
            break;
        case events.BLOCK_ALL:
            blockUrl(shortsUrl)
                .then(_ => {
                    sendMessage({ status: true, message: "Successfully blocked all Youtube Shorts." })
                    broadcastSettingsChanges();
                })
                .catch(e => sendMessage({ status: false, message: e.message || 'Cannot block.' }))
            break;
        case events.HIDE_ALL:
            hideAllShorts()
                .then(s => {
                    sendMessage(s)
                    broadcastSettingsChanges()
                })
                .catch(e => sendMessage(e))
            break;
        default:
            break;
    }

    return true;

});

browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

    if (!changeInfo.url) return true;

    if (changeInfo.status === 'loading') browserAPI.tabs.sendMessage(tabId, { type: events.TAB_CHANGED }).then(s => { }).catch(e => { })

    const url = await getVideoUrl(tab.url);
    if (!url) return true;

    const isBlocked = await isUrlBlocked(url);

    if (isBlocked) {
        const redirectUrl = browserAPI.runtime.getURL("blocked.html");
        browserAPI.tabs.update(tabId, { url: redirectUrl });
        return true;
    }

    if (!url.includes(shortsUrl)) return;

    await processLimiter(tabId);

    return true;

});