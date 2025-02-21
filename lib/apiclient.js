var http = require("http");
var https = require("https");
var domain = require("domain");
const { XMLParser } = require('fast-xml-parser');
var logger = require("./logger");

const parser = new XMLParser();

var APIs = {
    "anagram": function(msg, apikey, callback) {
        var options = {
            host: "anagramgenius.com",
            path: "/server.php?" + "source_text=" + encodeURI(msg) + "&vulgar=1",
            timeout: 20
        };

        urlRetrieve(http, options, function(status, data) {
            data = data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/);
            callback(data);
        });
    },

    "wolfram": function(query, apikey, callback) {
        var options = {
            host: "api.wolframalpha.com",
            path: "/v2/query?input=" + encodeURIComponent(query) + "&appid=" + apikey,
            timeout: 20
        };

        var findAnswer = function(pods) {
            for (var i = 0; i < pods.length; i++) {
                if (pods[i]["primary"]) return callback(pods[i]["subpods"][0]["value"]);
            }

            for (var i = 1; i < pods.length; i++) {
                if (pods[i]["subpods"][0]["value"]) {
                    return callback(pods[i]["subpods"][0]["value"]);
                } else if (pods[i]["subpods"][0]["text"]) {
                    return callback(pods[i]["subpods"][0]["text"]);
                }
            }

            return callback("WolframAlpha query failed");
        };

        var getPods = function(xml) {
            if (!xml.queryresult || xml.queryresult.error) {
                return callback(xml.queryresult?.error?.msg || "WolframAlpha query failed");
            }

            var pods = (xml.queryresult.pod || []).map(function(pod) {
                var subpods = (pod.subpod || []).map(function(node) {
                    return {
                        title: node.title || "",
                        value: node.plaintext || ""
                    };
                });

                var primary = pod.primary === "true";
                return {
                    title: pod.title || "",
                    subpods: subpods,
                    primary: primary
                };
            });

            return pods;
        };

        urlRetrieve(http, options, function(status, data) {
            let xmlDoc = {};

            try {
                xmlDoc = parser.parse(data);
            } catch (e) {
                return callback("Error parsing XML");
            }

            return findAnswer(getPods(xmlDoc));
        });
    },

    "weather": function(data, apikey, callback) {
        var query = "";
        var options = {};

        if (data.split(" ").length === 1) {
            options = {
                host: "api.wunderground.com",
                path: "/api/" + apikey + "/conditions/q/" + data + ".json",
                timeout: 20
            };

            urlRetrieve(http, options, function(status, data) {
                callback(data);
            });
            return;
        }

        try {
            var stringData = data.split(" ");
            var country = stringData[stringData.length - 1];
            stringData.splice(stringData.length - 1, 1);

            var fixedString = "";

            for (var k in stringData) {
                fixedString += stringData[k] + "_";
            }

            fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"));

            query = country + "/" + fixedString;
            options = {
                host: "api.wunderground.com",
                path: "/api/" + apikey + "/conditions/q/" + query + ".json",
                timeout: 20
            };

            urlRetrieve(http, options, function(status, data) {
                return callback(data);
            });
        } catch (e) {
            logger.errlog.log(e);
        }
    },

    "forecast": function(data, apikey, callback) {
        var query = "";
        var options = {};

        if (data.split(" ").length === 1) {
            options = {
                host: "api.wunderground.com",
                path: "/api/" + apikey + "/conditions/forecast/q/" + data + ".json",
                timeout: 20
            };

            urlRetrieve(http, options, function(status, data) {
                callback(data);
            });
            return;
        }

        try {
            var stringData = data.split(" ");
            var country = stringData[stringData.length - 1];
            stringData.splice(stringData.length - 1, 1);

            var fixedString = "";

            for (var k in stringData) {
                fixedString += stringData[k] + "_";
            }

            fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"));

            query = country + "/" + fixedString;
            options = {
                host: "api.wunderground.com",
                path: "/api/" + apikey + "/conditions/forecast/q/" + query + ".json",
                timeout: 20
            };

            urlRetrieve(http, options, function(status, data) {
                return callback(data);
            });
        } catch (e) {
            logger.errlog.log(e);
        }
    },

    "socketlookup": function(serverData, apiKeys, callback) {
        var excellentServerRegex = /^http(s)?:\/\/([\da-z\.-]+\.[a-z\.]{2,6})([\/\w \.-]*)*\:?(\d*)?\/?$/;
        var matches = serverData.server.match(excellentServerRegex);
        var secure = matches[1] !== undefined;
        var defaultPort = secure ? 443 : 80;

        var options = {
            host: matches[2],
            port: matches[5] !== undefined ? matches[6] : defaultPort,
            path: "/socketconfig/" + serverData.room + ".json",
            timeout: 20
        };

        urlRetrieve(secure ? https : http, options, (res, data) => {
            if (res !== 200) {
                logger.errlog.log(`!~~~! Error looking up Cytube server info ${res}`);
                process.exit(1);
            }

            var json = JSON.parse(data);
            var serverUrl;

            for (const server of json.servers) {
                if (server.secure === true) {
                    serverUrl = server.url;
                    break;
                } else {
                    serverUrl = server.url;
                }
            }

            if (serverUrl) {
                console.log(`got url ${serverUrl}`);
                callback(serverUrl);
            } else {
                console.log(`got thing ${res}`);
                callback(null);
            }
        });
    },

    "youtubelookup": function(id, apiKey, callback) {
        var params = [
            "part=" + "id,contentDetails,status",
            "id=" + id,
            "key=" + apiKey
        ].join("&");

        var options = {
            host: "www.googleapis.com",
            port: 443,
            path: "/youtube/v3/videos?" + params,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000
        };

        urlRetrieve(https, options, function(status, data) {
            if (status !== 200) {
                callback(status, null);
                return;
            }

            data = JSON.parse(data);
            if (data.pageInfo.totalResults !== 1) {
                callback("Video not found", null);
                return;
            }

            var vidInfo = {
                id: data["items"][0]["id"],
                contentDetails: data["items"][0]["contentDetails"],
                status: data["items"][0]["status"]
            };

            callback(true, vidInfo);
        });
    }
};

var urlRetrieve = function(transport, options, callback) {
    var req = transport.request(options, function(res) {
        var buffer = "";
        res.setEncoding("utf-8");
        res.on("data", function(chunk) {
            buffer += chunk;
        });
        res.on("end", function() {
            callback(res.statusCode, buffer);
        });
    });

    req.on('error', err => {
        console.error(`Something went wrong, ${err}`);
        callback(null);
    });

    req.end();
};

module.exports = {
    APIs: APIs,
    APICall: function(msg, type, apikey, callback) {
        if (type in this.APIs) {
            this.APIs[type](msg, apikey, callback);
        }
    },
    retrieve: urlRetrieve
};
