var messageBubbleTimeout;

const browserAPI = chrome;

const events = {
    GET_SETTINGS: "GET_SETTINGS",
    LIMIT_SHORTS: "LIMIT_SHORTS",
    BLOCK_ALL: "BLOCK_ALL"
}

function hour2Minutes(totalMinutes) {
    if (!totalMinutes) return { hours: 0, minutes: 0 }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
}

function showMessageBubble() {
    messageBubble.classList.add('success');
    messageBubble.classList.add('show');
    messageBubbleTimeout = setTimeout(() => {
        submitBtn.disabled = false;
        messageBubble.classList.remove('show');
        messageBubble.classList.remove('success');
    }, 2000);
}

function processTimeLimit(formData) {
    const shortsAmt = parseInt(formData.get("shortsAmount") || '0');
    const hours = parseInt(formData.get('hours') || '0');
    const minutes = parseInt(formData.get("minutes") || '0');

    if (!shortsAmt && !hours && !minutes) return;

    const totalMinutes = (hours * 60) + minutes;

    browserAPI.runtime.sendMessage({
        type: events.LIMIT_SHORTS, 
        data: {
            amount: shortsAmt,
            totalMinutes
        }
    }, (response) => {

        if (response?.status) {
            showMessageBubble()
        } else {
            submitBtn.disabled = false
        }

    });

    return;
}

function processBlockingAllShorts() {
    browserAPI.runtime.sendMessage({ type: events.BLOCK_ALL }, (response) => {
        if (response?.status) {
            showMessageBubble();
            shortsAmount.value = 0;
            hours.value = 0;
            minutes.value = 0;
        } else {
            submitBtn.disabled = false;
        }
    });
}

function handleFormSubmit(e) {
    e.preventDefault();

    if (messageBubbleTimeout) clearTimeout(messageBubbleTimeout);
    const formData = new FormData(e.target);
    const selection = formData.get('setting');

    submitBtn.disabled = true

    if (selection === "timeLimit") {
        processTimeLimit(formData);
    } else {
        processBlockingAllShorts();
    }
}

function onRadioSettingChange(e) {
    const { target: { value } } = e;
    if (value === "timeLimit") {
        limitSettings.classList.remove("hidden")
    } else {
        limitSettings.classList.add("hidden")
    }
}

browserAPI.runtime.sendMessage({ type: events.GET_SETTINGS }, (response) => {

    const { status, data } = response;
    if (!status) return;
    const { selector } = data;
    if (!selector) return;

    if (selector === 'blockAll') {
        blockAllRadioBtn.checked = true;
        timeLimitRadioBtn.checked = false;
    } else {
        blockAllRadioBtn.checked = false;
        timeLimitRadioBtn.checked = true;

        const { timeData } = data;
        if (!timeData) return;

        limitSettings.classList.remove('hidden');

        shortsAmount.value = timeData?.amount || 0;

        const timeValues = hour2Minutes(timeData?.totalMinutes || 0);
        hours.value = timeValues.hours;
        minutes.value = timeValues.minutes;

    }

    return;

});

settingsForm.addEventListener('submit', handleFormSubmit);
const settingsRadioBtns = document.querySelectorAll('#settingsForm input[type=radio][name=setting]')
if (settingsRadioBtns) settingsRadioBtns.forEach((e) => e.addEventListener('change', onRadioSettingChange));