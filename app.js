//Load the ADODB module
var ADODB = require('node-adodb');
var request = require('request');
var http = require("https");
ADODB.debug=true;
var client_id;
var client_secret;
var tokenReceived = '';
var featureServiceURL;
var geocodeBody = {}; //This is where the geocoded result will be stored until it is ready to go to the masterDataContainer.
var masterDataContainer = {}; //Holding container for the data pulled from Access

//addresses object to be used to pass into the world geocoding service.
var addresses = {
    records: []
};

//*****************************************
//             SETTINGS
//*****************************************

//Update location to where the db is stored. MUST USE DOUBLE FORWARD SLASHES!!
var sourceDataFile = "C:\\inetpub\\wwwroot\\Events_Node\\EventsDB_.mdb";
//ACCESS DB Query String
var queryAllEvents = 'SELECT * FROM [Events];'
var queryCurrentEvents = 'SELECT * FROM [Events] WHERE [Events].[StartDate] < date() AND [Events].[EndDate] > date();'

//Get these from the AGO application. Required to generate the access token, which is required to make changes to the dataset.
client_id = 'tAppQC2oNTgIOElj';
client_secret = 'e722b7311d4f45e6acf6234f65c38fc5';

//Update the AGO Feature Service you want the data copied to. 
//You need to have the /0/applyEdits at the end of the string.
featureServiceURL = 'https://services.arcgis.com/PMTtzuTB6WiPuNSv/arcgis/rest/services/eventsmap/FeatureServer/0/applyEdits'

//*****************************************
//          DATABASE CONNECTION
//*****************************************

var connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + sourceDataFile)

//Container for the parameters that will be passed into the EventsMap update.
//options is the json object that will be sent to AGOL.
var options = { 
    method: 'POST',
    //Update to match the appropriate feature service!
    url: featureServiceURL,
    headers: 
    {'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'},
    formData:
    { f: 'json',
      token: tokenReceived,              
      //options object are added under 'adds' and must be converted to a string prior to sending to AGOL.
      adds: JSON.stringify(masterDataContainer) 
    } 
};

//UPDATE ACCESS DB QUERY HERE. 
connection.query(queryAllEvents)
    .then(data => {
        console.log("Query database..");

        //copy results from query into masterDataContainer bin outside this Promise scope.
        masterDataContainer = data;
        //method that transforms the masterDataContainer object into what ArcGIS needs.
    })
    .then(function() {
        format(masterDataContainer);
    })
    .then(function() {
        authenticate(client_id, client_secret);
    })
    .catch(error => console.log("error: ", error));

//Method used to transform data object to feature layer.
function format(obj) {
    console.log("Formatting data..");
    
    //These will all need to be updated to match the data schema (fields) being pulled from the AccessDB table.
    for (i in obj) {
        //Populate the spatial data. A third function may be required to geocode addresses if there is no point data already available.
        masterDataContainer[i].geometry = {
            "x": obj[i].Lon_x,
            "y": obj[i].Lat_y
        },
        masterDataContainer[i].attributes = {
            "OBJECTID": obj[i].ID,
            "Description": obj[i].Description,
            "StartDate": obj[i].StartDate,
            "EndDate": obj[i].EndDate,            
            //Note: Lat/Long notation is backwards from (x,y) cartesian coordinates. That's why you see Latitude = the Y coordinate and Longitude = the X coordinate.
            "Lat_y": obj[i].Lat_y,
            "Lon_x": obj[i].Lon_x,
            "SingleLine": obj[i].Address
            //NOTE: If you add fields here, you need to also add fields in the AGO Feature Service, and configure pop-up to make the field visible. Whatta pain!
        }

        //pull address data from masterDataContainer and format so it agrees with single line format for arcgis geocoder.
        var geocodingData = {
            "attributes": {
                "OBJECTID": obj[i].ID,
                "SingleLine": obj[i].Address
            }
        };
        //pushes the current state of geocodingData for each iteration into the records array of addresses.
        addresses.records.push(geocodingData);

        //The old properties must be deleted so the object matches the feature service.        
        delete masterDataContainer[i].ID;
        delete masterDataContainer[i].Description;
        delete masterDataContainer[i].StartDate;
        delete masterDataContainer[i].EndDate;
        delete masterDataContainer[i].Lat_y;
        delete masterDataContainer[i].Lon_x;
        delete masterDataContainer[i].Address;
    }
}

function authenticate(clientId, clientSecret) {
    var credentials = {
        'client_id': clientId,
        'client_secret': clientSecret,
        'grant_type': 'client_credentials',
        'expiration': '2880'
    }    
    request.post({
        url: 'https://www.arcgis.com/sharing/rest/oauth2/token/', //This is where you ask for a token on AGOL, not the feature service url.
        json: true,
        form: credentials,
    }, function(error, response, body) {
        options.formData.tokenReceived = body.access_token.toString();
        options.formData.token = body.access_token.toString();
        if (error) {
            console.log("Error generating token: ", error)
        } else {
            console.log("Authentication complete. Got token. Moving on. ")
        }
        geocode(addresses)              
    })  
}

function geocode(data) {
    data = JSON.stringify(addresses);
    var req = "http://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/geocodeAddresses" 
        + "?addresses=" 
        + data
        + "&sourceCountry=USA"
        + "&token="
        + options.formData.tokenReceived
        + "&f=pjson";
    request(req, function (error, response, body) {
        if (error) {
            console.log("Error: ", error);
        } else {
            console.log("Geocoding complete. Parsing results and updating geometry.");
            geocodeBody = JSON.parse(body);
            for (var i=0; i < geocodeBody.locations.length; i++){
                masterDataContainer[i].geometry.x = geocodeBody.locations[i].location.x;
                masterDataContainer[i].geometry.y = geocodeBody.locations[i].location.y;
                masterDataContainer[i].attributes.Lon_x = geocodeBody.locations[i].location.x;
                masterDataContainer[i].attributes.Lat_y = geocodeBody.locations[i].location.y;
            }
            options.formData.adds = JSON.stringify(masterDataContainer);
            updateAGOL();
        }
    })
}

function updateAGOL() {
    console.log("Uploading to ArcGIS Online..");
    request(options, function (error, response, body) { 
        if (error) throw new Error(error);
        console.log("Completed successfully: ", body);
    })
}