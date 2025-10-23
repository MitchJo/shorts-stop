const shortsUrl = "youtube.com/shorts/";

const keys = {
    blockPath: shortsUrl,
    timeLimit: "timeLimit",
    watchedData: "watchedData" 
}

const events = {
    GET_SETTINGS: "GET_SETTINGS",
    LIMIT_SHORTS: "LIMIT_SHORTS",
    BLOCK_ALL: "BLOCK_ALL"
}

function getTimeLimitData(){

    return new Promise((resolve, reject) => {

        chrome.storage.local.get(keys.timeLimit)
            .then(s=>resolve(s[keys.timeLimit]))
            .catch(e=> {
                console.log(e.message);
                reject(null)
            })
        
    })

}

function getWatchedData(){
    return new Promise((resolve, _) => {

        chrome.storage.local.get(keys.watchedData)
            .then(s=>resolve(s[keys.watchedData]))
            .catch(e=> {
                console.log(e.message);
                resolve({lastWatchedTime: 0, remaining: 0})
            })
        
    })
}

function setWatchedData(data){
    return new Promise((resolve, reject) => {

        chrome.storage.local.set({[keys.watchedData]: data})
            .then(s=>resolve(s))
            .catch(e=> reject(e))
        
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
        chrome.declarativeNetRequest.getDynamicRules(rules => {
            const match = rules.find(rule => {
                return rule.condition?.urlFilter === targetUrl;
            });
            resolve(!!match);
        });
    });

}

function unblock(path){

    return new Promise((resolve,reject) => {

        chrome.storage.local.get(path, data => {
            const ruleId = data[path]
            if (ruleId) {

                chrome.declarativeNetRequest.updateDynamicRules({
                    addRules: [],
                    removeRuleIds: [ruleId]
                }, () => {
                    chrome.storage.local.remove(path);
                    resolve({ status: true, message: "Successfully unblock path." });
                });
                
            } else {
                reject({ success: false, message: 'No such path.' });
            }

        });
    })
}

function blockUrl(url){
    return new Promise((resolve, _) => {
        
        try{
            chrome.storage.local.remove(keys.timeLimit)
            chrome.storage.local.remove(keys.watchedData)
        }catch(e){}

        const ruleId = Math.floor(Date.now() % 1000000);

        chrome.declarativeNetRequest.updateDynamicRules({
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
                chrome.storage.local.set({ [url]: ruleId });
                resolve({ success: true, message: 'URL blocked.' });
            } catch (e) {
                resolve({ success: false, message: e.message || "An error occurred." })
            }

        })

    });
}

function saveTimeLimit(data){
    return new Promise((resolve, reject) => {

        chrome.storage.local.set({[keys.timeLimit]: data })
            .then(s=>{
                resolve({status: true, message: "Time limit saved successfully."})
            })
            .catch(e => {
                reject({status: true, message: e.message || "Could not save Time limit."});
            })

    })
}

function limitShorts(data){
    return new Promise(async (resolve,reject) => {
        unblock(shortsUrl).then(_=>{}).catch(_=>{})

        saveTimeLimit(data)
            .then(s=> {
                
                setWatchedData({lastWatchedTime: 0, expectedResetTime: 0, remaining: data?.amount || 0})
                    .then(s=> resolve(s))
                    .catch(e=> reject(e))

            })
            .catch(e=> reject(e))
        
    })
}

function processLimiter(tabId){
    return new Promise(async (resolve,_)=>{

        const timeLimitData = await getTimeLimitData();
        if(!timeLimitData) resolve(null);

        const {amount, totalMinutes} = timeLimitData;
        const {expectedResetTime = 0, remaining} = await getWatchedData();

        let shortsWatched = (remaining < 0 ? 1 : remaining) - 1;
        const currentTime= Date.now();
        
        let newResetTime = expectedResetTime;

        if(currentTime > expectedResetTime) {
            newResetTime = currentTime + (totalMinutes * 60000);
            shortsWatched = amount;
        }

        await setWatchedData({
            lastWatchedTime: currentTime,
            expectedResetTime: newResetTime,
            remaining: shortsWatched
        })

        if(shortsWatched < 1 ) {
            const redirectUrl = chrome.runtime.getURL("warning.html");
            chrome.tabs.update(tabId, { url: redirectUrl });
        }

        resolve(true);


    })
}

function getSettingsData(){
    return new Promise((resolve, reject) => {

        try{
           chrome.storage.local.get(shortsUrl)
            .then(s=> {
                if(s[shortsUrl]) resolve({status: true, data: {selector: 'blockAll'} }) 
            });
        }catch(e){}


       
        getTimeLimitData()
            .then(timeData=>{
                if(!timeData) reject({status: false, message: 'N/A'})

                getWatchedData()
                    .then(w=> resolve({status: true, data: {selector: 'timeLimit', timeData, watchedData: w}}) )
                    .catch(e=> reject({status: false, message: e.message || 'N/A'}) )

            })
            .catch(e=> reject({status: false, message: 'N/A'}))
      


    })

}

chrome.runtime.onMessage.addListener((msg, sender, sendMessage) => {

    switch (msg.type) {
        case events.GET_SETTINGS:
            getSettingsData()
                .then(s=> sendMessage(s))
                .catch(e=> sendMessage(e) )
            break
        case events.LIMIT_SHORTS:
            limitShorts(msg.data)
                .then(s=> sendMessage({status: true, message: "Successfully limited Youtube Shorts."}) )
                .catch(e=> sendMessage({status: false, message: e.message || 'Cannot Limit.'}))
            break;
        case events.BLOCK_ALL:
            blockUrl(shortsUrl)
                .then(s=> sendMessage({status: true, message: "Successfully blocked all Youtube Shorts."}) )
                .catch(e=> sendMessage({status: false, message: e.message || 'Cannot block.'}))
            break;
        default:
            break;
    }

    return true;

});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

    if (!changeInfo.url) return true;

    const url = await getVideoUrl(tab.url);
    if (!url) return true;

    const isBlocked = await isUrlBlocked(url);

    if (isBlocked) {
        const redirectUrl = chrome.runtime.getURL("blocked.html");
        chrome.tabs.update(tabId, { url: redirectUrl });
        return true;
    }

    if(!url.includes(shortsUrl)) return;

    await processLimiter(tabId);
   
    return true;

});