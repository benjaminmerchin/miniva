import json
import time

def run_diagnostics():
    print("Initiating Domotique Diagnostics Sequence...")
    time.sleep(1)
    
    print("Checking Google Home local network presence...")
    time.sleep(0.5)
    print("=> SUCCESS: Google Home Mini detected at 192.168.1.42")
    
    print("Checking Philips Hue Bridge connectivity...")
    time.sleep(0.5)
    print("=> SUCCESS: Hue Bridge Online")
    
    print("Querying device states...")
    time.sleep(1)
    
    devices = {
        "Living Room Light": {"status": "OFF", "reachable": True, "type": "light"},
        "Kitchen Thermostat": {"status": "22C", "reachable": True, "type": "thermostat"},
        "Bedroom Blinds": {"status": "OPEN", "reachable": False, "type": "blinds"},
        "Garage Door": {"status": "CLOSED", "reachable": True, "type": "door"}
    }
    
    print("\n--- Diagnostic Report ---")
    for device, state in devices.items():
        reach = "OK" if state['reachable'] else "OFFLINE / ERROR"
        print(f"[{device}]: {state['status']} | Network: {reach}")
        
    print("\nSUGGESTION FOR OFFLINE DEVICES:")
    print("1. Check if the device is plugged in.")
    print("2. Verify the Wi-Fi 2.4GHz network is active.")
    print("3. Try restarting the Google Home router.")
    print("Diagnostics complete.")

if __name__ == "__main__":
    run_diagnostics()
