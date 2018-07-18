//Load the ADODB module
var ADODB = require('node-adodb');
var request = require('request');
var http = require("https");
ADODB.debug=true;

//Connection strings & Open the database.

//Update location to where the db is stored. MUST USE DOUBLE FORWARD SLASHES!!
var sourceDataFile = "C:\\inetpub\\wwwroot\\Events_Node\\EventsDB_.mdb";
var connection = ADODB.open('Provider=Microsoft.Jet.OLEDB.4.0;Data Source=' + sourceDataFile)

//Holding container for the data pulled from Access
var dataContainer = {}; 
var options = {};

//UPDATE ACCESS DB QUERY HERE. 
connection.query("SELECT * FROM [Events];") 
    .then(data => {

        //copy results from query into dataContainer bin outside this Promise scope.
        dataContainer = data;  

        //method that transforms the dataContainer object into what ArcGIS needs.
        format(dataContainer); 

        //options is the json object that will be sent to AGOL.
        options = { 
            method: 'POST',

            //Update to match the appropriate feature service!
            url: 'https://services.arcgis.com/PMTtzuTB6WiPuNSv/arcgis/rest/services/eventsmap/FeatureServer/0/applyEdits', 
            headers: 
            { 'Postman-Token': '0b6eed18-16a0-40ec-8615-079bcc1898f0',
                'Cache-Control': 'no-cache',
                'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
            formData: 
            { f: 'json',
              token: 'aPsWX1bR3JA3lB4S1LYYrplHUafsP6C-Qgbd6KUWSorut-bxeED3XU1IN_coJv3E69FxkPdx4oIGDY25H-jpOYyJepkBMWc6SRhGZbVYK6j_zEtpMgszcwsy31iq5Ce_RAGN0VdmxATuZ0ex9YWrPw', //add authentication here
              
              //must be converted to a string prior to sending to AGOL.
              adds: JSON.stringify(dataContainer) 
            } 
        };
    })
    .then(function() {

        //send the data to AGOL. Handle response.
        request(options, function (error, response, body) { 
            if (error) throw new Error(error);          
            console.log("Completed successfully: ", body);
        })
    })

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
