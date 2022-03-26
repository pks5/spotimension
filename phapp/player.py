import gpiozero
import json
import sys
import time
import threading
import requests
from requests.auth import HTTPBasicAuth

class Player:
    def __init__(self):
        self.version = "0.9.3"
        self.state = {}
        self.settings = {
            "notify_url": "fhtp://broadcast/{DEVICE}/app/{APP}/script/{SCRIPT}",
            "spotify_client_id": "9b64281617ef4fc8b84a0eb6e8d9e18f",
            "spotify_client_secret": "ec289893133346a1be787a5be807ae03",
            "transfer_sleep": 1
        }
        
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
    
    def request_token(self, auth_code, redirect_uri):
        r = requests.post("https://accounts.spotify.com/api/token", 
                auth=HTTPBasicAuth(self.settings["spotify_client_id"], self.settings["spotify_client_secret"]), 
                data={
                    "code":  auth_code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code"
                })
        
        if(r.ok):
            self.state["auth"] = r.json()
            print("Received access token.", flush=True)
        else:
            print("Could not receive token: server returned " + str(r.status_code), file=sys.stderr, flush=True)    

        return r

    def start_playback(self, data):
        if("auth" not in self.state):
            print("No auth!", file=sys.stderr, flush=True)
            return

        hed = {'Authorization': 'Bearer ' + self.state["auth"]["access_token"]}
        
        url = 'https://api.spotify.com/v1/me/player/play'
        r = requests.put(url, json=data, headers=hed)
        if(r.ok):
            print("Playback started.", flush=True)
        else:
            print("Could not start playback: server returned " + str(r.status_code) + ": " + r.text, file=sys.stderr, flush=True)    

    def pause_playback(self):
        if("auth" not in self.state):
            print("No auth!", file=sys.stderr, flush=True)
            return

        hed = {'Authorization': 'Bearer ' + self.state["auth"]["access_token"]}
        
        url = 'https://api.spotify.com/v1/me/player/pause'
        r = requests.put(url, headers=hed)
        if(r.ok):
            print("Playback paused.", flush=True)
        else:
            print("Could not pause playback: server returned " + str(r.status_code) + ": " + r.text, file=sys.stderr, flush=True) 

    def get_devices(self):
        if("auth" not in self.state):
            print("No auth!", file=sys.stderr, flush=True)
            return

        hed = {'Authorization': 'Bearer ' + self.state["auth"]["access_token"]}
        
        url = 'https://api.spotify.com/v1/me/player/devices'
        r = requests.get(url, headers=hed)
        if(r.ok):
            self.state["devices"] = r.json()["devices"]
            print("Devices received.", flush=True)
        else:
            print("Could not receive devices: server returned " + str(r.status_code) + ": " + r.text, file=sys.stderr, flush=True) 

    def transfer_playback(self, data):
        if("auth" not in self.state):
            print("No auth!", file=sys.stderr, flush=True)
            return

        hed = {'Authorization': 'Bearer ' + self.state["auth"]["access_token"]}
        
        url = 'https://api.spotify.com/v1/me/player'
        r = requests.put(url, json=data, headers=hed)
        if(r.ok):
            print("Activated devices.", flush=True)
        else:
            print("Could not activate devices: server returned " + str(r.status_code) + ": " + r.text, file=sys.stderr, flush=True)    

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
                #TODO: Test if auth is still valid, otherwise set to None
                self.update_state()
                return

            if(action == "GET_DEVICES"):
                self.get_devices()

                self.update_state()
                return

            if(action == "TRANSFER"):
                if("data" not in message_body):
                    print("data must be provided!", file=sys.stderr, flush=True)
                    return
                self.transfer_playback(message_body["data"])
                time.sleep(self.settings["transfer_sleep"])
                self.get_devices()
                self.update_state()
                return

            if(action == "SET_AUTH_CODE"):
                if(("code" not in message_body) or ("redirect_uri" not in message_body)):
                    print("code and redirect_uri must be provided!", file=sys.stderr, flush=True)
                    return
                auth_code = message_body["code"]
                redirect_uri = message_body["redirect_uri"]
                
                self.request_token(auth_code, redirect_uri)
                

                self.update_state()

                return
            
            if(action == "PLAY"):
                if("data" not in message_body):
                    print("data must be provided!", file=sys.stderr, flush=True)
                    return
                self.start_playback(message_body["data"])

            if(action == "PAUSE"):
                self.pause_playback()

            if(action == "SETUP"):
                init_required=True
                given_settings = message_body["settings"]
                
                #if("pin" in given_settings):
                #    self.settings["pin"] = given_settings["pin"]
                
                if(init_required):
                    self.init()
                
                self.update_state()
                return
    
    def init(self):
        self.update_state()
        print("Initialized player.", flush=True)

    def cleanup(self):
        print("Cleaned up.")

try:
    player = Player()
    player.init()
    player.receive()
    
except KeyboardInterrupt:
    print('Good Bye!')
finally:
    player.cleanup()
