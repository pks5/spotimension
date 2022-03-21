import gpiozero
import json
import sys
import time
import threading
import logging
import nfc

class Detector:
    def __init__(self):
        self.version = "0.9.2"
        self.state = {}
        self.settings = {
            "notify_url": "fhtp://broadcast/{DEVICE}/app/{APP}/script/{SCRIPT}",
            "address": "tty:S0",
            "retry_time": 1,
            "log_level": logging.INFO
        }
        self.listener_thread_running = False
        self.listener_thread_paused = True
        self.device = None
        
    def send(self, data):
        payload = {
            "headers": {
                "to": self.settings["notify_url"]
            },
            "body": data
        }
        print("<<" + json.dumps(payload), flush=True)

    def update_state(self):
        self.send({
            "version": self.version,
            "state": self.state,
            "settings": self.settings
        })
    
    def receive(self):
        print("Ready to receive commands from socket ...", flush=True)
        for line in sys.stdin:
            sMessage = line[:-1]
            
            if(sMessage[0:3] == '>>{'):
                message = json.loads(sMessage[2:])
                try:
                    self.process(message)
                except KeyboardInterrupt:
                    raise
                except Exception as e:
                    print(e, file=sys.stderr, flush=True)

    def process(self, message):
        message_body = message["body"]

        if("action" in message_body):
            action = message_body["action"]
        
            if(action == "STATUS"):
                self.update_state()
                return
            
            if(action == "SETUP"):
                init_required=False
                given_settings = message_body["settings"]
                if("address" in given_settings):
                    self.settings["address"] = given_settings["address"]
                    init_required=True
                if(init_required):
                    self.init()
                self.update_state()
                return
    
    def handleTag(self, tag):
        self.state["tag"] = tag.identifier.hex()
        self.update_state()

        if(self.settings["log_level"] < logging.INFO):
            print("Found tag: " + str(self.state["tag"]), flush=True)

        #True for loop until tag is removed
        #False for immediate return
        return True

    def listen_target(self):
        print("Listening for NFC tags ...", flush=True)
        self.listener_thread_running = True
        while self.listener_thread_running:
            try:
                if(not self.listener_thread_paused):
                    self.device.connect(rdwr={'on-connect': self.handleTag})
                    
                    self.state["tag"] = None
                    self.update_state()

                    if(self.settings["log_level"] < logging.INFO):
                        print("No tag present.", flush=True)
                        
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(e, file=sys.stderr, flush=True)
                time.sleep(self.settings["retry_time"])
        print("Listener thread finished.", flush=True)
    
    def listen(self):
        if(self.listener_thread_running):
            print("Listener thread already running.", flush=True)
        else:
            threading.Thread(target=self.listen_target).start()
    
    def init(self):
        if(self.device is not None):
            self.listener_thread_paused = True
            self.device.close()
            print("Closed NFC device.", flush=True)

        self.device = nfc.ContactlessFrontend()
        self.device.open(self.settings["address"])

        self.listener_thread_paused = False
        print("Initialized NFC device on address " + self.settings["address"], flush=True)


    def cleanup(self):
        self.listener_thread_paused = True
        self.listener_thread_running = False
        if(self.device is not None):
            self.device.close()
            print("Closed NFC device.", flush=True)
        
        print("Cleaned up.")

try:
    detector = Detector()
    detector.init()
    detector.listen()
    detector.receive()
except KeyboardInterrupt:
    print('Good Bye!')
finally:
    detector.cleanup()
