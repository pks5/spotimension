const elLastComConnect = document.getElementById("last-com-connect"),
    elStatusModal = new bootstrap.Modal(document.getElementById('status-modal'), { backdrop: "static" });

const oConfig = {
    appId: "com.machineblocks.machines.spotimension",
    deviceHostName: "breadboard",
    authClientId: "spotimension"
};


let oFeatureHub;

let fnConnect = function () {
    Spotimension.init();

    oFeatureHub = new FeatureHub({
        appId: oConfig.appId,
        clientId: oConfig.authClientId
    });

    //TODO
    oFeatureHub.m_oSocketClient.addEventListener("socketClose", () => {
        elStatusModal.show();

        Spotimension.log("UI Socket Disconnected.");
    });

    oFeatureHub.addEventListener("connect", () => {
        console.log("UI Socket Connected.");
        elStatusModal.hide();

        Spotimension.log("UI Socket Connected.");
    });

    Spotimension.log("Connecting to FeatureHub Cloud ...");
    oFeatureHub.connect(oServerInfo => {
        Spotimension.log("Connected to " + oServerInfo.webSocketUrl);

        Spotimension.log("Getting list of available devices ...");
        oFeatureHub.devices(Spotimension.onReceiveDevices);
    });
};

let scriptLocation = 'https://my.featurehub.net/lib/v1/fhub.js';

if (location.hostname.indexOf('.localnet') !== -1) {
    //  scriptLocation = 'http://app.featurehub.localnet:8787/lib/v1/fhub.js';
}

scriptLocation = 'http://mbp-pks.local:8787/lib/v1/fhub.js';

const script = document.createElement('script');
script.src = scriptLocation;
script.addEventListener('load', fnConnect);
document.body.appendChild(script);


document.getElementById("test-btn").addEventListener("click", () => {
    const client_id = "9b64281617ef4fc8b84a0eb6e8d9e18f";


    var authorizeUrl = 'https://accounts.spotify.com/authorize';
    authorizeUrl += '?response_type=code';
    authorizeUrl += '&client_id=' + encodeURIComponent(client_id);
    authorizeUrl += '&scope=' + encodeURIComponent("user-read-playback-state,user-modify-playback-state,user-read-currently-playing");
    authorizeUrl += '&redirect_uri=' + encodeURIComponent("REDIRECT_URI");
    authorizeUrl += '&state=' + encodeURIComponent("STATE");

    const requestOptions = {
        method: 'POST',
       // credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
            {
                authorizeUrl:authorizeUrl,
                previousUrl:location.href,
                featureGuid:"com.machineblocks.machines.spotimension",
                machineId:Spotimension.m_sSelectedDeviceMachineId,
                deviceAppGuid:"com.machineblocks.machines.spotimension.phapp",
                scriptName:"player.py"
            }
        )
    };
    fetch('http://mbp-pks.local:8787/system/feature/auth/start', requestOptions)
        .then(response => response.json())
        .then((data) => {
           console.log(data)
            location.href = data.authorizeUrl;
        });
});

document.getElementById("devices-btn").addEventListener("click", () => {
    Spotimension.requestDevices();
});

document.getElementById("spotify-device-select").addEventListener("change", (ev) => {
    ev.target.disabled = true;
    console.log("Activating device: %s", ev.target.value);
    Spotimension.transferPlayback(ev.target.value);
    
});

let Spotimension = {};

Spotimension.log = function (sMessage, sLevel) {
    console.log(sMessage);
};

Spotimension.init = function () {
    let elSelect = document.getElementById("deviceSelect");
    elSelect.addEventListener("change", Spotimension.onSelectDevice);

    Spotimension.elSelect = elSelect;

    fetch('data/tags.json')
         .then(response => response.json())
        .then(data => {
            Spotimension.tags = data.tags;
        });
};

Spotimension.onReceiveDevices = function (oData) {
    Spotimension.log("Found " + oData.devices.length + " available devices.");
    let elSelect = Spotimension.elSelect,
        sCurrentValue = elSelect.value,
        bCurrentValueFound = false;

    elSelect.innerHTML = "";

    let elOpt = document.createElement('option');
    elOpt.innerHTML = "Select Device";
    elSelect.appendChild(elOpt);

    for (let i = 0; i < oData.devices.length; i++) {
        let oDevice = oData.devices[i];
        
        elOpt = document.createElement('option');

        elOpt.value = oDevice.machineId;
        elOpt.innerHTML = oDevice.hostName;
        elSelect.appendChild(elOpt);

        if (sCurrentValue && oDevice.machineId === sCurrentValue) {
            bCurrentValueFound = true;
            elOpt.selected = true;
        }
    }

    if (!bCurrentValueFound) {
        sCurrentValue = null;
    }

    if (!sCurrentValue) {
        if (oData.devices.length === 1) {
            elSelect.value = oData.devices[0].machineId;
        }
        else if (window.BletaElectron) {
            elSelect.value = BletaElectron.getMachineId();
        }
        else {
            for (let i = 0; i < oData.devices.length; i++) {
                let oDevice = oData.devices[i];
                if (oDevice.hostName === oConfig.deviceHostName) {
                    elSelect.value = oDevice.machineId;
                }
            }
        }

        Spotimension.onSelectDevice();
    }


};

Spotimension.onSelectDevice = function () {
    let sMachineId = Spotimension.elSelect.value;

    if (sMachineId) {
        //term.clear();
        Spotimension.selectDevice(sMachineId);
    }
};

Spotimension.deviceInfo = function (sMachineId) {
    Spotimension.log("Requesting device info " + sMachineId + " ...");
    oFeatureHub.device(sMachineId, function (oData) {
        console.log(oData);

        if (Spotimension.m_oConnectCountdownTimer) {
            clearInterval(Spotimension.m_oConnectCountdownTimer);
            delete Spotimension.m_oConnectCountdownTimer;
        }

        if (oData.device.comConnected) {
            elLastComConnect.classList.remove("text-danger");
            Spotimension.m_oConnectCountdownTimer =
                countdown(
                    new Date(oData.device.lastComConnectDate),
                    function (ts) {
                        elLastComConnect.innerHTML = (ts.hours ? (String(ts.hours).padStart(2, '0') + ":") : "") + String(ts.minutes).padStart(2, '0') + ":" + String(ts.seconds).padStart(2, '0');
                    },
                    countdown.HOURS | countdown.MINUTES | countdown.SECONDS
                );
        }
        else {
            elLastComConnect.innerHTML = "disconnected";
            elLastComConnect.classList.add("text-danger");
        }


    }, function () {

    });
};

Spotimension.selectDevice = function (sMachineId) {

    if (sMachineId !== Spotimension.m_sSelectedDeviceMachineId) {
        Spotimension.log("Selected device " + sMachineId);
    }
    Spotimension.m_sSelectedDeviceMachineId = sMachineId;

    /*
      * Setup Default Target
      */
    oFeatureHub.setDefaultTarget({
        device: sMachineId
    });




    /*
    * Subscribe to Console
    */
    oFeatureHub.unsubscribe('deviceConsole');
    oFeatureHub.subscribe('deviceConsole', sMachineId + "/console", function (oData, mHeaders) {
        let sPrefix = "[" + sMachineId.substr(0, 6) + "] ";

        console.log(sPrefix + oData.args[0]);
    });

    /*
    * Subscribe to Device Status
    */
    oFeatureHub.unsubscribe('deviceStatus');
    oFeatureHub.subscribe('deviceStatus', sMachineId, Spotimension.onReceiveDeviceStatus);

    oFeatureHub.send({ method: "requestStatus" }, {});

    oFeatureHub.unsubscribe("player");
    oFeatureHub.subscribe("player", sMachineId + "/app/" + "com.machineblocks.machines.spotimension.phapp" + "/script/" + "player.py", Spotimension.onReceivePlayerStatus);
    
    oFeatureHub.unsubscribe("detector");
    oFeatureHub.subscribe("detector", sMachineId + "/app/" + "com.machineblocks.machines.spotimension.phapp" + "/script/" + "detector.py", Spotimension.onDetectTag);

    oFeatureHub.send({ method: "startApp" }, { app: {url: (new URL("app.json", location.origin + location.pathname.replace("webapp", "phapp"))).toString()} });

    //Spotimension.requestPlayerStatus();
};

Spotimension.updateConnectionStatus = function (sMachineId, bConnected) {
    if (bConnected) {
        console.log("Device %s is connected.", sMachineId);
        elLastComConnect.classList.remove("text-danger");

        if (!Spotimension.m_sConnectedDeviceMachineId || (Spotimension.m_sConnectedDeviceMachineId !== sMachineId)) {
            Spotimension.deviceInfo(sMachineId);
        }

        Spotimension.m_sConnectedDeviceMachineId = sMachineId;
    }
    else {

        console.log("Device %s is disconnected.", sMachineId);

        if (Spotimension.m_oConnectCountdownTimer) {
            clearInterval(Spotimension.m_oConnectCountdownTimer);
            delete Spotimension.m_oConnectCountdownTimer;
        }

        elLastComConnect.innerHTML = "disconnected";
        elLastComConnect.classList.add("text-danger");

        delete Spotimension.m_sConnectedDeviceMachineId;
    }

    Spotimension.m_bConnected = bConnected;
};



/*
* Triggered when a Device Status Message has been received
*/
Spotimension.onReceiveDeviceStatus = function (oData, mHeaders) {
    console.log('DEVICE STATUS', oData, mHeaders);

    let sFromAsString = mHeaders["fh-from"],
        sFrom = new URL(sFromAsString),
        sToAsString = mHeaders["fh-to"],
        sTo = new URL(sToAsString);

    if (sFromAsString === "fhtp://system/") {
        let aToPathParts = sTo.pathname.split("/"),
            sMachineId = aToPathParts[3];

        if (Spotimension.m_sSelectedDeviceMachineId && (Spotimension.m_sSelectedDeviceMachineId !== sMachineId)) {
            console.warn("Received status from device %s, but it's not selected.", sMachineId);
            return;
        }

        Spotimension.updateConnectionStatus(sMachineId, false);

    }
    else {
        let aFromPathParts = sFrom.pathname.split("/"),
            sMachineId = aFromPathParts[aFromPathParts.length - 1],
            sPhappId = sFrom.searchParams.get("app");

        if (!sPhappId) {
            if (Spotimension.m_sSelectedDeviceMachineId && (Spotimension.m_sSelectedDeviceMachineId !== sMachineId)) {
                console.warn("Received status from device %s, but it's not selected.", sMachineId);
                return;
            }

            Spotimension.updateConnectionStatus(sMachineId, oData.connected);


        }
        else {
            //Ignore messages from other PyApps on this device
        }
    }

};

Spotimension.requestPlayerStatus = function(){
    oFeatureHub.send({ method: "sendMessage", app: "com.machineblocks.machines.spotimension.phapp", script: "player.py" }, { action: "STATUS"});
};

Spotimension.requestDevices = function(){
    oFeatureHub.send({ method: "sendMessage", app: "com.machineblocks.machines.spotimension.phapp", script: "player.py" }, { action: "GET_DEVICES"});
};

Spotimension.transferPlayback = function(sSpotifyDeviceId){
    oFeatureHub.send({ method: "sendMessage", app: "com.machineblocks.machines.spotimension.phapp", script: "player.py" }, { action: "TRANSFER", data: {device_ids:[sSpotifyDeviceId]}});
};

Spotimension.onReceivePlayerStatus = function (oData, mHeaders) {
    const elSpotifyDeviceSelect = document.getElementById("spotify-device-select");
    elSpotifyDeviceSelect.disabled = true;
    elSpotifyDeviceSelect.innerHTML = "";

    if(oData.state.devices){
        let elOpt;
        const aDevices = oData.state.devices;
        for(let i = 0; i < aDevices.length; i++){ 
            const oDevice = aDevices[i];
            elOpt = document.createElement('option');

            elOpt.value = oDevice.id;
            elOpt.innerHTML = oDevice.name + (oDevice.is_active ? " (active)" : "");
            elOpt.selected = oDevice.is_active;
            elSpotifyDeviceSelect.appendChild(elOpt);
        }

        elSpotifyDeviceSelect.disabled = false;
    }

    console.log("PLAYER_STATUS", oData);
};

Spotimension.onDetectTag = function (oData, mHeaders) {
    console.log("TAG", oData);

    const sTag = oData.state.tag,
        elTagImage = document.getElementById("tag-img");

    if(sTag){
        const oTag = Spotimension.tags[sTag];

        console.log("Tag", oTag);
        document.body.style.backgroundImage = "url('" + oTag.background + "')";
        elTagImage.src = oTag.image;

        oFeatureHub.send({ method: "sendMessage", app: "com.machineblocks.machines.spotimension.phapp", script: "player.py" }, { action: "PLAY", data: oTag.audio.spotify});
    }
    else{
        document.body.style.backgroundImage = "url('./img/bg.jpeg')";
        elTagImage.src = "";

        oFeatureHub.send({ method: "sendMessage", app: "com.machineblocks.machines.spotimension.phapp", script: "player.py" }, { action: "PAUSE"});
    }
   
};