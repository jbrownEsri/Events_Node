//Load the ADODB module
var ADODB = require('node-adodb');
var request = require('request');
var http = require("https");
ADODB.debug=true;
var client_id;
var client_secret;
var tokenReceived = '';
var featureServiceURL;

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
//Holding container for the data pulled from Access
var dataContainer = {}; 
//Container for the parameters that will be passed into the EventsMap update.
var options = {};

//UPDATE ACCESS DB QUERY HERE. 
connection.query(queryCurrentEvents)
    .then(data => {
        console.log("Query database..");
        console.log("Formatting data..");
        console.log("Uploading to ArcGIS Online..");
        //copy results from query into dataContainer bin outside this Promise scope.
        dataContainer = data;
        //method that transforms the dataContainer object into what ArcGIS needs.
        format(dataContainer);
     })
    .then(function() {
        //options is the json object that will be sent to AGOL.
        options = { 
            method: 'POST',
            //Update to match the appropriate feature service!
            url: featureServiceURL,
            headers: 
            {'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'},
            formData:
            { f: 'json',
              token: tokenReceived,              
              //options object are added under 'adds' and must be converted to a string prior to sending to AGOL.
              adds: JSON.stringify(dataContainer) 
            } 
        };
    })
    .then(function() {
        authenticate(client_id, client_secret);
    })
    .then(setTimeout(function() {
        options.formData.token = tokenReceived;
        request(options, function (error, response, body) { 
            if (error) throw new Error(error);
            console.log("Completed successfully: ", body);
        })
    }, 1000))
    .catch(error => console.log("error: ", error));

//Method used to transform data object to feature layer.
function format(obj) {

    //These will all need to be updated to match the data schema (fields) being pulled from the AccessDB table.
    for (i in obj) {

        //Populate the spatial data. A third function may be required to geocode addresses if there is no point data already available.
        dataContainer[i].geometry = {
            "x": obj[i].Lon_x,
            "y": obj[i].Lat_y
        },
        dataContainer[i].attributes = {
            "ID": obj[i].ID,
            "Description": obj[i].Description,
            "StartDate": obj[i].StartDate,
            "EndDate": obj[i].EndDate,

            //Note: Lat/Long notation is backwards from (x,y) cartesian coordinates. That's why you see Latitude = the Y coordinate and Longitude = the X coordinate.
            "Lat_y": obj[i].Lat_y,
            "Lon_x": obj[i].Lon_x
        }
        //The old properties must be deleted so the object matches the feature service.        
        delete dataContainer[i].ID;
        delete dataContainer[i].Description;
        delete dataContainer[i].StartDate;
        delete dataContainer[i].EndDate;
        delete dataContainer[i].Lat_y;
        delete dataContainer[i].Lon_x;
    }
}

function authenticate(clientId, clientSecret) {
    var credentials = {
        'client_id': clientId,
        'client_secret': clientSecret,
        'grant_type': 'client_credentials',
        'expiration': '2880'
    }
    
    return request.post({
        url: 'https://www.arcgis.com/sharing/rest/oauth2/token/', //This is where you ask for a token on AGOL, not the feature service url.
        json: true,
        form: credentials,
    }, function(error, response, body) {
        options.formData.token = body.access_token;
        tokenReceived = body.access_token;
        if (error) new Error(error);
    })    
}