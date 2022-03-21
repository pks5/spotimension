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

let Spotimension = {};

Spotimension.log = function (sMessage, sLevel) {
    console.log(sMessage);
};

Spotimension.init = function () {
    let elSelect = document.getElementById("deviceSelect");
    elSelect.addEventListener("change", Spotimension.onSelectDevice);

    Spotimension.elSelect = elSelect;
};

Spotimension.onReceiveDevices = function (oData) {
    Spotimension.log("Found " + oData.devices.length + " available devices.");
    let elSelect = Spotimension.elSelect,
        sCurrentValue = elSelect.value,
        bCurrentValueFound = false;

    elSelect.innerHTML = "";

    elOpt = document.createElement('option');
    elOpt.innerHTML = "Select Device";
    elSelect.appendChild(elOpt);

    for (let i = 0; i < oData.devices.length; i++) {
        let oDevice = oData.devices[i],
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
        let sColor = '\x1b[37m';
        if (oData.level === "error") {
            sColor = '\x1b[1;31m';
        }

        let sPrefix = "[" + sMachineId.substr(0, 6) + "] ";

        term.writeln(sColor + sPrefix + oData.args[0]);
    });

    /*
    * Subscribe to Device Status
    */
    oFeatureHub.unsubscribe('deviceStatus');
    oFeatureHub.subscribe('deviceStatus', sMachineId, Spotimension.onReceiveDeviceStatus);

    oFeatureHub.send({ method: "requestStatus" }, {});
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