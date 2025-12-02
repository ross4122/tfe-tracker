// Initialize the map
const map = L.map("map").setView([55.9521, -3.1957], 16); // Set initial view to a known coordinate

// Set up the map tiles (this example uses OpenStreetMap)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Add the "Locate Me" button control
L.control
  .locate({
    position: "topleft", // Controls the position (like the zoom buttons)
    follow: true, // Center map on the user's location when it changes
    setView: true, // Automatically zooms in when the location is found
    keepCurrentZoomLevel: true, // Don't zoom out when moving to the location
    icon: "fa fa-location-arrow", // Icon for the locate button
    iconLoading: "fa fa-spinner fa-spin", // Icon when locating
    showPopup: false, // Optional: display popup with the location
  })
  .addTo(map);

// Request user's location and add a blue circle marker
function addUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        // Add a blue circle marker for the user
        L.circleMarker(userCoords, {
          color: "blue", // Border color
          fillColor: "blue", // Fill color
          fillOpacity: 0.5,
          radius: 5, // Adjust size of the circle
        }).addTo(map);

        // Center the map on the user's location
        map.setView(userCoords, 14);
      },
      (error) => {
        console.error("Error getting user location:", error.message);
      }
    );
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

// Call function to request location
addUserLocation();

// Function to calculate seconds ago since data was received
function secondsAgo(timestamp) {
  const now = new Date();
  const dataTime = new Date(timestamp);

  // Check if the timestamp is valid
  if (isNaN(dataTime)) {
    return "Invalid timestamp"; // Handle invalid timestamps
  }

  const diff = now - dataTime; // Time difference in milliseconds
  return Math.floor(diff / 1000); // Convert milliseconds to seconds
}

// Create sets for the fleet numbers (for fast lookup)
const rReqIconFleetNumbers = new Set([
  "2",
  "4",
  "15",
  "16",
  "19",
  "20",
  "21",
  "23",
  "24",
  "25",
  "28",
  "33",
  "34",
  "36",
  "48",
  "49",
  "61",
  "63",
  "172",
  "195",
  "198",
  "224",
  "284",
  "285",
  "287",
  "288",
  "289",
  "430",
  "457",
  "560",
  "700",
  "930",
  "934",
  "938",
  "1080",
  "1082",
  "1083",
  "9005",
  "9201",
]);

const kReqIconFleetNumbers = new Set(["229"]);

const bothReqIconFleetNumbers = new Set([
  "22",
  "31",
  "39",
  "191",
  "192",
  "193",
  "228",
  "286",
  "700",
  "701",
  "704",
  "708",
  "714",
  "717",
  "720",
  "728",
  "730",
  "733",
  "735",
  "737",
  "738",
  "739",
  "743",
  "747",
  "748",
  "753",
  "760",
  "761",
  "763",
  "765",
  "766",
  "767",
  "770",
  "772",
  "773",
  "774",
  "777",
  "779",
  "780",
  "781",
  "782",
  "783",
  "786",
  "789",
  "791",
  "795",
  "796",
  "797",
  "798",
  "9001",
  "9002",
  "9006",
  "9008",
  "9009",
  "9011",
  "9012",
  "9013",
  "9101",
  "9102",
  "9202",
  "9203",
  "9204",
  "9205",
  "9206",
  "9207",
]);

// Function to create custom rectangle icons with fleet numbers
function createVehicleIcon(fleetNumber) {
  const html = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%;">${fleetNumber}</div>
  `; // Fleet number inside the rectangle, centered using Flexbox

  // Determine which icon class to use based on the fleet number
  let iconClass = "newicon"; // Default class

  if (rReqIconFleetNumbers.has(fleetNumber)) {
    iconClass = "r-reqicon"; // For fleet numbers in r-reqicon set
  } else if (kReqIconFleetNumbers.has(fleetNumber)) {
    iconClass = "k-reqicon"; // For fleet numbers in k-reqicon set
  } else if (bothReqIconFleetNumbers.has(fleetNumber)) {
    iconClass = "bothreqicon"; // For fleet numbers in bothreqicon set
  }

  return L.divIcon({
    iconSize: [32, 13], // Size of the rectangle
    html: html, // HTML content for the icon
    className: iconClass, // Use the appropriate icon class
    popupAnchor: [0, -5], // Popup anchor adjustment
  });
}

/// Function to get fleet number (removes depot code if present)
function getFleetNumber(fleetNumber) {
  const parts = fleetNumber.split(" "); // Split on space
  return parts[parts.length - 1]; // Return the last part (fleet number)
}

const vehicleMarkers = new Map();
let lastOpenedFleetNumber = null; // Store last opened popup's fleet number
let popupWasOpen = false; // Track if a popup was open before refresh

// Function to filter vehicles based on selected checkboxes
function filterVehicles(vehicle) {
  const rReqChecked = document.getElementById("rReqCheckbox").checked;
  const kReqChecked = document.getElementById("kReqCheckbox").checked;
  const bothReqChecked = document.getElementById("bothReqCheckbox").checked;

  const fleetNumber = vehicle.vehicle_id;

  const isRReq = rReqIconFleetNumbers.has(fleetNumber);
  const isKReq = kReqIconFleetNumbers.has(fleetNumber);
  const isBothReq = bothReqIconFleetNumbers.has(fleetNumber);

  // Display vehicle if any checkbox is checked and the vehicle belongs to that category
  return (
    (rReqChecked && isRReq) ||
    (kReqChecked && isKReq) ||
    (bothReqChecked && isBothReq) ||
    (!rReqChecked && !kReqChecked && !bothReqChecked)
  );
}

// Function to fetch and display vehicle locations
async function fetchVehicleData() {
  try {
    const response = await fetch(
      "https://tfe-opendata.com/api/v1/vehicle_locations"
    );
    const data = await response.json();

    // Check if a popup is open before updating markers
    popupWasOpen = !!map._popup;

    if (!data.vehicles) return;

    // Check if "Requirements" checkbox is ticked
    const showRequirementsOnly = document.getElementById(
      "requirementsCheckbox"
    ).checked;

    // Remove vehicles that should no longer be shown
    if (showRequirementsOnly) {
      // Loop through all markers and remove those that don't meet the requirement
      vehicleMarkers.forEach((marker, fleet_number) => {
        if (
          !rReqIconFleetNumbers.has(fleet_number) &&
          !kReqIconFleetNumbers.has(fleet_number) &&
          !bothReqIconFleetNumbers.has(fleet_number)
        ) {
          marker.remove(); // Remove the marker from the map
          vehicleMarkers.delete(fleet_number); // Remove the marker from the map's tracking list
        }
      });
    }

    data.vehicles.forEach((vehicle) => {
      if (!vehicle.latitude || !vehicle.longitude) return;

      const fleet_number = vehicle.vehicle_id; // Fleet number
      const lat = vehicle.latitude;
      const lon = vehicle.longitude;
      const line = vehicle.service_name || ""; // Service number (empty if not available)
      const destination = vehicle.destination || ""; // Destination (empty if not available)
      let lastFixSecs = vehicle.last_gps_fix_secs || 0; // Time since last GPS fix

      // Adjust last_gps_fix_secs based on the source
      if (vehicle.source === "MyBusTracker" && lastFixSecs > 3600) {
        lastFixSecs -= 3600; // Subtract 1 hour (3600 seconds) if from MyBusTracker and last_gps_fix_secs > 3600
      }

      // Convert last_gps_fix to a timestamp (in seconds)
      const lastGpsFixTimestamp = vehicle.last_gps_fix;

      // Calculate the time difference from the current time (in seconds)
      const currentTime = Math.floor(Date.now() / 1000); // Get current time in seconds
      const timeSinceLastFix = currentTime - lastGpsFixTimestamp; // Time in seconds

      // Only show vehicles with data from the last 15 minutes (900 seconds)
      if (timeSinceLastFix > 900) {
        console.log(
          `Skipping vehicle ${fleet_number} due to old data (last fix: ${timeSinceLastFix} seconds ago)`
        );
        return; // Skip rendering this vehicle
      }

      // If "Requirements" checkbox is ticked, filter based on fleet number lists
      if (
        showRequirementsOnly &&
        !(
          rReqIconFleetNumbers.has(fleet_number) ||
          kReqIconFleetNumbers.has(fleet_number) ||
          bothReqIconFleetNumbers.has(fleet_number)
        )
      ) {
        return; // Skip this vehicle if it's not in the required lists
      }

      // Format "last seen" time
      let timeAgo;
      if (lastFixSecs < 60) {
        timeAgo = `${lastFixSecs} seconds ago`;
      } else if (lastFixSecs < 120) {
        timeAgo = "1 minute ago";
      } else {
        timeAgo = `${Math.floor(lastFixSecs / 60)} minutes ago`;
      }

      // Convert timestamp to a human-readable date format
      const lastSeenDate = new Date(lastGpsFixTimestamp * 1000); // Convert timestamp from seconds to milliseconds
      const lastSeenTime = lastSeenDate.toLocaleString(); // Format it as a locale-specific string

      // Determine what to display for line and destination in the popup
      let popupText = "";
      if (line && destination) {
        popupText = `<b>${line}</b> to <b>${destination}</b>`;
      } else if (line && !destination) {
        popupText = `<b>${line}</b>`;
      } else if (!line && !destination) {
        popupText = "Not in Service";
      }

      // Check if the marker already exists
      if (vehicleMarkers.has(fleet_number)) {
        vehicleMarkers.get(fleet_number).setLatLng([lat, lon]);
      } else {
        const marker = L.marker([lat, lon], {
          icon: createVehicleIcon(fleet_number),
        }).addTo(map);

        marker.bindPopup(`
          <b>${popupText}</b><br>
          <b>${fleet_number}</b><br>
          <small>${timeAgo}</small>
        `);

        // Save marker in the map
        vehicleMarkers.set(fleet_number, marker);

        // Store the last opened popup's fleet number when clicked
        marker.on("popupopen", () => {
          lastOpenedFleetNumber = fleet_number;
          popupWasOpen = true;
        });

        // Reset last opened fleet number when popup is closed
        marker.on("popupclose", () => {
          lastOpenedFleetNumber = null;
          popupWasOpen = false;
        });
      }
    });

    // Only reopen the popup if it was open before the refresh
    if (
      popupWasOpen &&
      lastOpenedFleetNumber &&
      vehicleMarkers.has(lastOpenedFleetNumber)
    ) {
      vehicleMarkers.get(lastOpenedFleetNumber).openPopup();
    }
  } catch (error) {
    console.error("Error fetching vehicle data:", error);
  }
}

document
  .getElementById("requirementsCheckbox")
  .addEventListener("change", fetchVehicleData);

// Initial fetch of vehicle locations
fetchVehicleData();

// Poll for updates every 10 seconds
setInterval(fetchVehicleData, 10000);

let fetchTimeout;

// Fetch data after the user stops moving the map for 1 second
map.on("moveend", () => {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(fetchVehicleData, 1000);
});