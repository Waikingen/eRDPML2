// constants
var MAX_NUMBER = 999;
var BEEP_INTERVAL = 1100;
var MSG_INTERVAL = 650;
var START_TIMEOUT = 1100;
var LONG_PRESS_INTERVAL = 2000;
var CHARS_PER_PAGE = 17;
var MSG_SEPARATOR = '--';

// global vars
var startNode = 0;
var nodeTable = {};
var state = null;
var resetTimer = 0;
var isOn = true;
var unit = 'm'; // or 'ft'
var isMute = false;
var nodeHistory = [];

// node info
var nodeInputProcessor = null;
var local = null;
var outNode = null;
var outNodeAlt = null;
var message = '';
var extras = {};
var timers = [];
var totalPages = 0;
var currPage = 0;
var pages = [];
var logNode = false;

// other data
var numpadLetters = {
    2: ['A', 'B', 'C'],
    3: ['D', 'E', 'F'],
    4: ['G', 'H', 'I'],
    5: ['J', 'K', 'L'],
    6: ['M', 'N', 'O'],
    7: ['P', 'Q', 'R', 'S'],
    8: ['T', 'U', 'V'],
    9: ['W', 'X', 'Y', 'Z'],
}

// fxns
function clearTimers() {
    for(var i = 0; i < timers.length; i++) {
        var t = timers[i];
        clearInterval(t);
    }
    timers = [];
}

function init() {
    nodeInputProcessor = null;
    state = startNode;
    extras = {};
    nodeHistory = [];

    // set up 
    document.getElementById('meter-sign').style.visibility = (unit == 'm')? 'visible': 'hidden';
    document.getElementById('imperial-sign').style.visibility = (unit == 'ft')? 'visible': 'hidden';
}

function start() {
    init();
    enterNode();
}

function displayMSG(msg){
    /*
    msg = msg.replace(/ /g,'&nbsp;');
    pages = msg.split(MSG_SEPARATOR);
    document.getElementById("display").innerHTML = pages[currPage];
    */

    // TODO: make sure that each page is less than 17 chars
    pages = msg.split(MSG_SEPARATOR);
    var currMSG = pages[currPage].toUpperCase();
    var htmlMSG = "";
    for (var i = 0; i < currMSG.length; i ++){
        htmlMSG += "<span class='dispChar'>" + currMSG[i] + "</span>"
    }
    document.getElementById("display").innerHTML = htmlMSG;
}

function displayOFF(){
    document.getElementById("display").innerHTML = "";
}

function displayNormal() {
    displayMSG(message);
}

function clearHistory() {
    extras = {};
    nodeHistory = [];
}

var display = displayNormal;

function enterNode() {
    //console.log("entering Node: " + state);
    if (!state in nodeTable){
        //console.log("ERROR, node not found");
        return;
    }

    // clear node vars
    local = null;
    nodeInputProcessor = null;
    preNodeJS = null;
    postNodeJS = null;
    outNode = null;
    outNodeAlt = null;
    altCondition = null;
    display = displayNormal;
    clearTimers();
    timers = [];
    message = '';
    variable = '';
    totalPages = 0;
    currPage = 0;
    pages = [];
    logNode = false;

    // load node info
    var nodeInfo = nodeTable[state];
    nodeType = nodeInfo['type'];
    outNode = nodeInfo['outNode'];
    // auto increment out node?
    var loadVar = false;
    if ('outNodeAlt' in nodeInfo)
        outNodeAlt = nodeInfo['outNodeAlt'];
    if ('preNodeJS' in nodeInfo)
        preNodeJS = nodeInfo['preNodeJS'];
    if ('postNodeJS' in nodeInfo)
        postNodeJS = nodeInfo['postNodeJS'];
    if ('altCondition' in nodeInfo)
        altCondition = nodeInfo['altCondition'];
    if ('clearHistory' in nodeInfo && nodeInfo['clearHistory'])
        clearHistory();
    message = nodeInfo['message'];
    if ('message' in nodeInfo)
        message = nodeInfo['message'];
    if ('variable' in nodeInfo)
        variable = nodeInfo['variable'];
    // load input processors and display type
    // init node.
    if (nodeType == 's' || nodeType == 'start') {
        beep();
        local = (unit=='m')? 'metric' : 'imperial';
        display = displayWithVar;
        timers.push(setTimeout(exitNode, START_TIMEOUT));
    } else if (nodeType == 'm' || nodeType == 'mode') {
        nodeInputProcessor = processModeInput;
        display = displayWithVar;
        altCondition = function () { return local.toLowerCase() == 'mode';};
        local = '';
    } else if (nodeType == 'i1' || nodeType == 'YNInput') {
        nodeInputProcessor = processYNInput;
        altCondition = function () { return local.toLowerCase() == 'no';};
        local = '';
        logNode = true;
    } else if (nodeType == 'i2' || nodeType == 'PGInput') {
        nodeInputProcessor = processPGInput;
        display = displayWithVar;
        local = '';
        logNode = true;
    } else if (nodeType == 'i3' || nodeType == 'numberInput') {
        nodeInputProcessor = processNumberInput;
        display = displayWithNumber;
        local = '';
        logNode = true;
    } else if (nodeType == 'i4' || nodeType == 'timeInput') {
        nodeInputProcessor = processTimeInput;
        display = displayWithTime;
        local = '';
        logNode = true;
    } else if (nodeType == 'i5' || nodeType == 'numberInputEmptyAllowed') {
        nodeInputProcessor = processNumberInputEmptyAllowed;
        display = displayWithNumber;
        local = '';
        logNode = true;
    } else if (nodeType == 'd' || nodeType == 'display') {
        nodeInputProcessor = processBasicInput;
        display = displayWithVar;
        loadVar = true;
        local = '';
        logNode = true;
    } else if (nodeType == 'w' || nodeType == 'warning') {
        nodeInputProcessor = processBasicInput;
        // doesn't tick...?
        display = displayWithVar;
        beep();
        makeTimer(beep, BEEP_INTERVAL, 2);
        loadVar = true;
        local = '';
    } else if (nodeType == 'c' || nodeType == 'conditional') {
        nodeInputProcessor = "skip";
        local = '';
    } else if (nodeType == 'x' || nodeType == 'off') {
        display = displayOFF;
        local = '';
    } else {
        nodeInputProcessor = processBasicInput;
    }
    if (typeof(message) == 'string')
        pages = message.split(MSG_SEPARATOR); // should make sure that each page is less than 17 chars
    else
        pages = [''];
    totalPages = pages.length;
    currPage = 0;
    if (totalPages > 1) {
        timers.push(makeTimer(tickMsg, MSG_INTERVAL, -1));
    }

    // Start processing the node
    if (loadVar && variable.length > 0 && variable in extras)
        local = extras[variable];

    // execute preNodeJS
    if (typeof(preNodeJS) == "function")
        preNodeJS();

    // display and input
    // if (typeof(nodeInputProcessor) == "function") {
    if (nodeInputProcessor == "skip") {
        // exit and go to the next node
        exitNode();
    } else {
        display();
        // wait for keypress
        return;
    }
}

function changeUnit(newUnit) {
    if (!isOn)
        return;
    
    unit = (newUnit == 'm')? 'm' : 'ft';
    
    document.getElementById('meter-sign').style.visibility = (unit == 'm')? 'visible': 'hidden';
    document.getElementById('imperial-sign').style.visibility = (unit == 'ft')? 'visible': 'hidden';

    processInput('on'); // reset the console
    processInput('on');
}

function processInput(input) {
    //console.log("processing input:" + input);
    // process universal inputs, and send input to node processors
    
    if (!isOn && input == 'on'){
        state = startNode;
        isOn = true;
        isMute = false;
        init();
        
        // display elements
        document.getElementById('sound-icon').style.visibility = 'visible';

        // now start the machine.
        enterNode();
    } else {
        if (!isMute){
            var click = document.getElementById('click');
            if (click == null || click.currentSrc == "")
                click = document.getElementById('click-alt');
            if (click != null) {
                try {
                    click.play();
                } catch (err){}
            }
        }

        if (input == 'on') {
            state = 'off';
            enterNode();
            isOn = false;

            // hide elements
            document.getElementById('sound-icon').style.visibility = 'hidden';
            document.getElementById('meter-sign').style.visibility = 'hidden';
            document.getElementById('imperial-sign').style.visibility = 'hidden';
        } else if (input == 'reset') {
            state = startNode;
            enterNode();
        } else if (input == 'mute'){
            isMute = !isMute;
            if (isMute)
                document.getElementById('sound-icon').style.visibility = 'hidden';
            else
                document.getElementById('sound-icon').style.visibility = 'visible';
            if (!isMute) // TODO: remove.
                beep();
        } else if (input == 'unit'){
            unit = (unit == 'm')? 'ft' : 'm';
        } else if (input == 'back'){
            if (nodeHistory.length > 0){
                state = nodeHistory.pop();
                enterNode();
            } else {
                state = 'I0'; // is this right?
                enterNode();
            }
        } else if (typeof(nodeInputProcessor) == "function") {
            // normal node processor
            var ret = nodeInputProcessor(input);
            if (ret == 1) // we're done with this node
                exitNode();
        }
    }
}

function exitNode() {
    //console.log("exiting Node: " + state);
    // stop any timers
    clearTimers();

    // execute preNodeJS
    if (variable.length > 0)
        extras[variable] = local

    if (typeof(postNodeJS) == "function")
        postNodeJS();

    if (logNode && nodeHistory instanceof Array){
        if (nodeHistory[nodeHistory.length-1] != state) // prevent dups
            nodeHistory.push(state);
    }
    
    // get ready for next node
    state = outNode;
    if (typeof(altCondition) == "function") {
        if (altCondition())
            state = outNodeAlt;
    }

    // enter the next node
    nodeInputProcessor = null;
    enterNode();
}

// node i1 definitions - YES/NO input
function processYNInput(input) {
    if (typeof(local)!="string")
        local = '';

    if (input == 'yes') {
        local = 'yes'
        return 1;
    } else if (input == 'no') {
        local = 'no'
        return 1;
    }
    display();
}

// node i2 definitions - PG input
function processPGInput(input) {
    if (typeof(local)!="string")
        local = '';

    if (input >= 2 && input <= 9) {
        var index = numpadLetters[input].indexOf(local);
        index = (index + 1) % numpadLetters[input].length;
        local = numpadLetters[input][index];
    } else if (input == 'enter') {
        if (local.length > 0)
            return 1;
    }
    display();
}
function displayWithVar() {
    displayMSG(message.replace('$var', local));
}

// node i3 definitions - number input
function processNumberInput(input) {
    if (input == 'del') {
        if (typeof(local) == "number" && local < 10)
            local = '';
        else
            local = Math.floor(local / 10);
    } else if (input >= 0 && input <= 9 && local*10 + input <= MAX_NUMBER) {
        if (typeof(local)!="number")
            local = 0;
        local = local * 10 + input
    } else if (input == 'enter') {
        if (typeof(local) == "number" && local > 0)
            return 1;
    }
    display();
}

function processNumberInputEmptyAllowed(input) {
    if (input == 'del') {
        if (typeof(local) == "number" && local < 10)
            local = '';
        else
            local = Math.floor(local / 10);
    } else if (input >= 0 && input <= 9 && local*10 + input <= MAX_NUMBER) {
        if (typeof(local)!="number")
            local = 0;
        local = local * 10 + input
    } else if (input == 'enter') {
        if (typeof(local) == "number")
            return 1;
        else if (local == '')
            return 1;
    }
    display();
}

function displayWithNumber() {
    var num = '' + local;
    while (num.length < 4) {
        num = " " + num;
    }
    //num = num.replace(/ /g,'&nbsp;');

    if (local == 0)
        displayMSG(message.replace('$number', "    "));
    else
        displayMSG(message.replace('$number', num));
}

// node i4 definitions - time input
function processTimeInput(input) {
    if (typeof(local)!="number")
        local = 0;

    if (input == 'del') {
        local = Math.floor(local / 10);
    } else if (input >= 0 && input <= 9 && local*10 + input <= 9999) {
        local = local * 10 + input;
    } else if (input == 'enter') {
        var total_min = 0;
        var min = local % 100;
        var hr = Math.floor(local / 100);
        if (hr > 24 || min > 59) //[LMNT 20150609 CHANGE TO PROMPT USER TO RE-ENTER IF MIN = 60]
            total_min = -1;
        else
            total_min = hr * 60 + min;
        local = total_min;
        return 1;
    }
    display();
}
function displayWithTime() {
    var num = '' + local;
    while (num.length < 4) {
        num = "0" + num;
    }
    var hr = num.substr(0,2);
    var min = num.substr(2,4);
    var output = hr + "H:" + min + "M";

    displayMSG(message.replace('$time', output));
}

// node d definitions
function processBasicInput(input) {
    if (input == 'enter') {
        return 1;
    }
    display();
}

// node w definitions
function beep() {
    //console.log('beep');
    var beep = document.getElementById('beep');
    if (beep == null || beep.currentSrc == "")
        beep = document.getElementById('beep-alt');
    if (beep!= null && !isMute){
        try{
            beep.play();
        } catch(err){
        }
    }
}
function makeTimer(func, interval, times, finalFunc) {
    if (! timers instanceof Array)
        timers = [];
    var curr = 0;
    var timerId = 0; // placeholder
    var tick = function() {
        curr++;
        if (times != -1 && curr >= times){
            clearInterval(timerId);
            if (finalFunc)// not sure if needed...
                finalFunc;
        }
        func();
    }
    timerId = setInterval(tick, interval);
    timers.push(timerId);
    return timerId;
}

// m node - mode select
function processModeInput(input) {
    if (input == 'mode') {
        local = 'mode';
        return 1;
    } else if (input == 'enter') {
        return 1;
    }
    display();
}

// misc
function clearExtras() {
    extras = {};
}
function tickMsg() {
    currPage = (currPage + 1) % totalPages;
    display();
}
function reset(){
    processInput("reset");
}
function pressedReset(){
    resetTimer = setTimeout(reset, LONG_PRESS_INTERVAL);
}
function canceledReset(){
    clearInterval(resetTimer);
}


////////////////////////
// Node table
nodeTable = 
{
    "0": {
        "type": "s", 
        "outNode": "I0", 
        "message": "PADI ERDPML--UNIT $var"
    }, 
    "I0": {
        "type": "m", 
        "outNode": "I1", 
        "outNodeAlt": "I1", 
        "message": "SELECT MODE"
    }, 
    "I1": {
        "type": "m", 
        "outNode": "P1", 
        "outNodeAlt": "I2", 
        "message": "DIVE PLANNING"
    }, 
    "I2": {
        "type": "m", 
        "outNode": "S1", 
        "outNodeAlt": "I3", 
        "message": "SURFACE INTERVAL"
    }, 
    "I3": {
        "type": "m", 
        "outNode": "M1", 
        "outNodeAlt": "I1", 
        "message": "MAXIMUM DEPTH"
    }, 
    "off": {
        "type": "x", 
        "outNode": "off"
    }, 
    "M1": {
        "type": "i1", 
        "outNode": "M2", 
        "outNodeAlt": "M7", 
        "message": "First Dive Y/N", 
        "clearHistory": true
    }, 
    "M2": {
        "type": "i3", 
        "outNode": "M3", 
        "message": "DIVE TIME $numberMIN", 
        "variable": "abt", 
        "postNodeJS": function () {extras['maxDepth'] = calcMaxDepth(extras['abt'])}
    }, //[LMNT 20150610]:
    	// The algorithm was always throwing "safety stop 3min" with no validation. Changes made:
    	// 1. Added node M5-1 to validate if PG is within last 3 groups
    	// 2. Re-routed M3 to point by default to M5-1
    	// 3. M5-1 checks the stop flag, and sends it to warning (M5). Defaults to display (M6)
    "M3": {
        "type": "c", 
        "outNode": "M5-1", 
        "outNodeAlt": "M4", 
        "altCondition": function () {return extras['maxDepth'] == -1}
    }, 
    "M4": {
        "type": "w", 
        "outNode": "M2", 
        "message": "EXCEEDS LIMIT"
    }, 
    "M5-1": {
        "type": "c", 
        "outNode": "M6", 
        "outNodeAlt": "M5",
        "message": "PG within 3 of NDL?", 
        "altCondition": function () {return extras['stop']}
    },
    "M5": {
        "type": "w", 
        "outNode": "M6", 
        "message": "SAFETY STOP  3MIN --SEE RULE 2"
    }, 
    "M6": {
        "type": "d", 
        "outNode": "M1", 
        "message": "MAX DEPTH    $var", 
        "variable": "maxDepth"
    }, 
    "M7": {
        "type": "i2", 
        "outNode": "M8", 
        "message": "PG AFTER SI   $var", 
        "variable": "pg"
    }, 
    "M8": {
        "type": "i3", 
        "outNode": "M9", 
        "message": "DIVE TIME $numberMIN", 
        "variable": "abt", 
        "postNodeJS": function () {extras['maxDepth'] = calcMaxDepthRep(extras['abt'], extras['pg'])}
    }, 
    //[LMNT 20150610]:
    	// The algorithm was always throwing "safety stop 3min" with no validation. Changes made:
    	// 1. Added node M5-1 to validate if PG is within last 3 groups
    	// 2. Re-routed M3 to point by default to M5-1
    	// 3. M5-1 checks the stop flag, and sends it to warning (M5). Defaults to display (M6)
    "M9": {
        "type": "c", 
        "outNode": "M5-1", 
        "outNodeAlt": "M10", 
        "altCondition": function () {return extras['maxDepth'] == -1}
    }, 
    "M10": {
        "type": "w", 
        "outNode": "M11", 
        "message": "EXCEEDS LIMIT"
    }, 
    "M11": {
        "type": "d", 
        "outNode": "M8", 
        "message": "ANDL    $var MIN", 
        "preNodeJS": function () {local = pgANDL(extras['pg'])}
    }, 
    "S1": {
        "type": "i1", 
        "outNode": "S2", 
        "outNodeAlt": "S22", 
        "message": "First Dive Y/N", 
        "clearHistory": true
    }, 
    "S2": {
        "type": "i3", 
        "outNode": "S3", 
        "message": "ENTER DEPTH1 $number", 
        "variable": "depth1", 
        "postNodeJS": function () {extras['depth1'] = nearestDepth(local)}
    }, 
    "S3": {
        "type": "c", 
        "outNode": "S5", 
        "outNodeAlt": "S4", 
        "altCondition": function () {return extras['depth1'] == -1}
    }, 
    "S4": {
        "type": "w", 
        "outNode": "S2", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "S5": {
        "type": "d", 
        "outNode": "S6", 
        "message": " NDL $var MIN", 
        "variable": "ndl", 
        "preNodeJS": function () {local = NDL(extras['depth1'])}
    }, 
    "S6": {
        "type": "i3", 
        "outNode": "S7", 
        "message": "ENTER ABT1$numberMIN", 
        "variable": "abt1", 
        "postNodeJS": function () {extras['pg1'] = firstPG(extras['depth1'], extras['abt1'])}
    }, 
    "S7": {
        "type": "c", 
        "outNode": "S9", 
        "outNodeAlt": "S8", 
        "altCondition": function () {return extras['abt1']>extras['ndl']}
    }, 
    "S8": {
        "type": "w", 
        "outNode": "S6", 
        "message": "EXCEEDS LIMIT"
    }, 
    "S9": {
        "type": "c", 
        "outNode": "S11", 
        "outNodeAlt": "S10", 
        "altCondition": function () {return extras['stop']}
    }, 
    "S10": {
        "type": "w", 
        "outNode": "S11", 
        "message": "SAFETY STOP  3MIN --SEE RULE 2"
    }, 
    "S11": {
        "type": "i3", 
        "outNode": "S12", 
        "message": "ENTER DEPTH2 $number", 
        "variable": "depth2", 
        "postNodeJS": function () {extras['depth2'] = nearestDepth(local)}
    }, 
    "S12": {
        "type": "c", 
        "outNode": "S14", 
        "outNodeAlt": "S13", 
        "altCondition": function () {return extras['depth2'] == -1}
    }, 
    "S13": {
        "type": "w", 
        "outNode": "S11", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "S14": {
        "type": "d", 
        "outNode": "S15", 
        "message": "ANDL   $var MIN", 
        "variable": "andl", 
        "preNodeJS": function () {local = ANDL('A',extras['depth2'])}
    }, 
    "S15": {
        "type": "i3", 
        "outNode": "S16", 
        "message": "ENTER ABT2$numberMIN", 
        "variable": "abt2", 
        "postNodeJS": function () {extras['pg2'] = minRepPG(extras['depth2'], extras['abt2'])}
    }, 
    "S16": {
        "type": "c", 
        "outNode": "S19", 
        "outNodeAlt": "S17", 
        "altCondition": function () {return extras['abt2']>extras['andl']}
    }, 
    "S17": {
        "type": "w", 
        "outNode": "S15", 
        "message": "EXCEEDS LIMIT"
    }, 
    "S19": {
        "type": "c", 
        "outNode": "S21", 
        "outNodeAlt": "S20", 
        "altCondition": function () {return extras['stop']}
    }, 
    "S20": {
        "type": "w", 
        "outNode": "S21", 
        "message": "SAFETY STOP  3MIN --SEE RULE 2"
    }, 
    "S21": {
        "type": "d", 
        "outNode": "S1", 
        "message": "MIN SI    $var", 
        "preNodeJS": function () {local = toHrMin(minSI(extras['pg1'], extras['pg2']))}
    }, 
    "S22": {
        "type": "i2", 
        "outNode": "S23", 
        "message": "PG END DIVE 1  $var", 
        "variable": "pg1"
    }, 
    "S23": {
        "type": "c", 
        "outNode": "S11", 
        "outNodeAlt": "S24", 
        "altCondition": function () {return "WXYZ".search(extras['pg1'])>=0}
    }, 
    "S24": {
        "type": "w", 
        "outNode": "S11", 
        "message": "WXYZ RULE --SEE RULE 6"
    }, 
    "P1": {
        "type": "i1", 
        "outNode": "ML2", 
        "outNodeAlt": "P2", 
        "message": "Multilevel   Y/N"
    }, 
    "P2": {
        "type": "i1", 
        "outNode": "P14", 
        "outNodeAlt": "P3", 
        "message": "First Dive Y/N", 
    }, 
    "P3": {
        "type": "i1", 
        "outNode": "P4", 
        "outNodeAlt": "P5", 
        "message": "PG after SI  Y/N"
    }, 
    "P4": {
        "type": "i2", 
        "outNode": "P21", 
        "message": "PG start dive $var", 
        "variable": "pg"
    }, 
    "P5": {
        "type": "i2", 
        "outNode": "P6", 
        "message": "PG before SI $var", 
        "variable": "o_pg"
    }, 
    "P6": {
        "type": "c", 
        "outNode": "P8", 
        "outNodeAlt": "P7", 
        "message": "WXYZ?", 
        "altCondition": function () {return "WXYZ".search(extras['o_pg'])>=0}
    }, 
    "P7": {
        "type": "w", 
        "outNode": "P8", 
        "message": "WXYZ RULE --SEE RULE 6"
    }, 
    "P8": {
        "type": "i4", 
        "outNode": "P9", 
        "message": "Enter SI  $time", 
        "variable": "o_si"
    }, 
    "P9": {
        "type": "c", 
        "outNode": "P11", 
        "outNodeAlt": "P10", 
        "message": "invalid time?", 
        "altCondition": function () {return extras['o_si'] == -1}
    }, 
    "P10": {
        "type": "w", 
        "outNode": "P8", 
        "message": "ENTER    HR:MIN"
    }, 
    "P11": {
        "type": "c", 
        "outNode": "P13", 
        "outNodeAlt": "P12", 
        "message": "new dive?", 
        "preNodeJS": function () {extras['pg'] = calcPGafterSI(extras['o_pg'], extras['o_si'])}, 
        "altCondition": function () {return extras['pg'] == -1}
    }, 
    "P12": {
        "type": "w", 
        "outNode": "P14", 
        "message": "NEW DIVE --SEE RULE 11", 
        "postNodeJS": function () {extras['pg'] = ''}
    }, 
    "P13": {
        "type": "d", 
        "outNode": "P21", 
        "message": "PG after SI   $var", 
        "variable": "pg"
    }, 
    "P14": {
        "type": "i3", 
        "outNode": "P15", 
        "message": "ENTER DEPTH $number", 
        "variable": "depth", 
        "postNodeJS": function () {extras['depth'] = nearestDepth(local)}
    }, 
    "P15": {
        "type": "c", 
        "outNode": "P17", 
        "outNodeAlt": "P16", 
        "message": ">42?", 
        "altCondition": function () {return extras['depth']==-1}
    }, 
    "P16": {
        "type": "w", 
        "outNode": "P14", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "P17": {
        "type": "d", 
        "outNode": "P18", 
        "message": " NDL  $var MIN", 
        "variable": "ndl", 
        "preNodeJS": function () {local = NDL(extras['depth'])}
    }, 
    "P18": {
        "type": "i3", 
        "outNode": "P19", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt"
    }, 
    "P19": {
        "type": "c", 
        "outNode": "P28", 
        "outNodeAlt": "P20", 
        "message": "exceed limit?", 
        "postNodeJS": function () {extras['pg1'] = firstPG(extras['depth'], extras['abt'])}, 
        "altCondition": function () {return extras['abt']>extras['ndl']}
    }, 
    "P20": {
        "type": "w", 
        "outNode": "P17", 
        "message": "EXCEEDS LIMIT"
    }, 
    "P21": {
        "type": "i3", 
        "outNode": "P22", 
        "message": "ENTER DEPTH $number", 
        "variable": "depth", 
        "postNodeJS": function () {extras['depth'] = nearestDepth(local)}
    }, 
    "P22": {
        "type": "c", 
        "outNode": "P24", 
        "outNodeAlt": "P23", 
        "message": ">42?", 
        "altCondition": function () {return extras['depth']==-1}
    }, 
    "P23": {
        "type": "w", 
        "outNode": "P21", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "P24": {
        "type": "d", 
        "outNode": "P25", 
        "message": "ANDL  $var MIN", 
        "variable": "andl", 
        "preNodeJS": function () {local = ANDL(extras['pg'], extras['depth'])}
    }, 
    "P25": {
        "type": "i3", 
        "outNode": "P26", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt"
    }, 
    "P26": {
        "type": "c", 
        "outNode": "P28", 
        "outNodeAlt": "P27", 
        "message": "exceed limit?", 
        "postNodeJS": function () {extras['pg1'] = pgAfterRepDive(extras['pg'], extras['depth'], extras['abt'])}, 
        "altCondition": function () {return extras['abt']>extras['andl']}
    }, 
    "P27": {
        "type": "w", 
        "outNode": "P24", 
        "message": "EXCEEDS LIMIT"
    }, 
    "P28": {
        "type": "c", 
        "outNode": "P30", 
        "outNodeAlt": "P29", 
        "message": "PG within 3 of NDL?", 
        "altCondition": function () {return extras['stop']}
    }, 
    "P29": {
        "type": "w", 
        "outNode": "P30", 
        "message": "SAFETY STOP  3MIN --SEE RULE 2"
    }, 
    "P30": {
        "type": "d", 
        "outNode": "P31", 
        "message": "PG AFTER DIVE $var", 
        "variable": "pg1"
    }, 
    "P31": {
        "type": "c", 
        "outNode": "P33", 
        "outNodeAlt": "P32", 
        "message": "wxyz?", 
        "altCondition": function () {return "WXYZ".search(extras['pg1'])>=0}
    }, 
    "P32": {
        "type": "w", 
        "outNode": "P33", 
        "message": "WXYZ RULE --SEE RULE 6"
    }, 
    "P33": {
        "type": "i4", 
        "outNode": "P34", 
        "message": "Enter SI  $time", 
        "variable": "si"
    }, 
    "P34": {
        "type": "c", 
        "outNode": "P36", 
        "outNodeAlt": "P35", 
        "message": "invalid time?", 
        "altCondition": function () {return extras['si'] == -1}
    }, 
    "P35": {
        "type": "w", 
        "outNode": "P33", 
        "message": "ENTER   HR:MIN"
    }, 
    "P36": {
        "type": "c", 
        "outNode": "P38", 
        "outNodeAlt": "P37", 
        "message": "new dive?", 
        "preNodeJS": function () {extras['pg'] = calcPGafterSI(extras['pg1'], extras['si'])}, 
        "altCondition": function () {return extras['pg'] == -1}
    }, 
    "P37": {
        "type": "w", 
        "outNode": "P14", 
        "message": "NEW DIVE --SEE RULE 11", 
        "postNodeJS": function () {extras['pg'] = ''}
    }, 
    "P38": {
        "type": "d", 
        "outNode": "P21", 
        "message": "PG after SI  $var", 
        "variable": "pg"
    }, 
    "ML2": {
        "type": "i1", 
        "outNode": "ML14", 
        "outNodeAlt": "ML3", 
        "message": "First Dive Y/N", 
    }, 
    "ML3": {
        "type": "i1", 
        "outNode": "ML4", 
        "outNodeAlt": "ML5", 
        "message": "PG after SI  Y/N"
    }, 
    "ML4": {
        "type": "i2", 
        "outNode": "ML21", 
        "message": "PG start dive $var", 
        "variable": "pg0"
    }, 
    "ML5": {
        "type": "i2", 
        "outNode": "ML6", 
        "message": "PG before SI $var", 
        "variable": "pg"
    }, 
    "ML6": {
        "type": "c", 
        "outNode": "ML8", 
        "outNodeAlt": "ML7", 
        "message": "WXYZ?", 
        "altCondition": function () {return "WXYZ".search(extras['pg'])>=0}
    }, 
    "ML7": {
        "type": "w", 
        "outNode": "ML8", 
        "message": "WXYZ RULE --SEE RULE 6"
    }, 
    "ML8": {
        "type": "i4", 
        "outNode": "ML9", 
        "message": "Enter SI $time", 
        "variable": "si"
    }, 
    "ML9": {
        "type": "c", 
        "outNode": "ML11", 
        "outNodeAlt": "ML10", 
        "message": "invalid time?", 
        "altCondition": function () {return extras['si'] == -1}
    }, 
    "ML10": {
        "type": "w", 
        "outNode": "ML8", 
        "message": "ENTER    HR:MIN"
    }, 
    "ML11": {
        "type": "c", 
        "outNode": "ML13", 
        "outNodeAlt": "ML12", 
        "message": "new dive?", 
        "preNodeJS": function () {extras['pg0'] = calcPGafterSI(extras['pg'], extras['si'])}, 
        "altCondition": function () {return extras['pg0'] == -1}
    }, 
    "ML12": {
        "type": "w", 
        "outNode": "ML14", 
        "message": "NEW DIVE --SEE RULE 11", 
        "postNodeJS": function () {extras['pg0'] = ''}
    }, 
    "ML13": {
        "type": "d", 
        "outNode": "ML21", 
        "message": "PG after SI   $var", 
        "variable": "pg0"
    }, 
    "ML14": {
        "type": "i3", 
        "outNode": "ML15", 
        "message": "ENTER LVL 1 $number", 
        "variable": "depth", 
        "postNodeJS": function () {extras['depth'] = nearestDepth(local)}
    }, 
    "ML15": {
        "type": "c", 
        "outNode": "ML17", 
        "outNodeAlt": "ML16", 
        "message": ">42?", 
        "altCondition": function () {return extras['depth']==-1}
    }, 
    "ML16": {
        "type": "w", 
        "outNode": "ML14", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "ML17": {
        "type": "d", 
        "outNode": "ML18", 
        "message": " NDL   $var MIN", 
        "variable": "ndl", 
        "preNodeJS": function () {local = NDL(extras['depth'])}
    }, 
    "ML18": {
        "type": "i3", 
        "outNode": "ML19", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt"
    }, 
    "ML19": {
        "type": "c", 
        "outNode": "ML28", 
        "outNodeAlt": "ML20", 
        "message": "exceed limit?", 
        "postNodeJS": function () {extras['pg1'] = firstPG(extras['depth'], extras['abt'])}, 
        "altCondition": function () {return extras['abt']>extras['ndl']}
    }, 
    "ML20": {
        "type": "w", 
        "outNode": "ML17", 
        "message": "EXCEEDS LIMIT"
    }, 
    "ML21": {
        "type": "i3", 
        "outNode": "ML22", 
        "message": "ENTER LVL 1 $number", 
        "variable": "depth", 
        "postNodeJS": function () {extras['depth'] = nearestDepth(local)}
    }, 
    "ML22": {
        "type": "c", 
        "outNode": "ML24", 
        "outNodeAlt": "ML23", 
        "message": ">42?", 
        "altCondition": function () {return extras['depth']==-1}
    }, 
    "ML23": {
        "type": "w", 
        "outNode": "ML21", 
        "message": "EXCEEDS LIMIT --SEE RULE 10"
    }, 
    "ML24": {
        "type": "d", 
        "outNode": "ML25", 
        "message": "ANDL   $var MIN", 
        "variable": "andl", 
        "preNodeJS": function () {local = ANDL(extras['pg0'], extras['depth'])}
    }, 
    "ML25": {
        "type": "i3", 
        "outNode": "ML26", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt"
    }, 
    "ML26": {
        "type": "c", 
        "outNode": "ML28", 
        "outNodeAlt": "ML27", 
        "message": "exceed limit?", 
        "postNodeJS": function () {extras['pg1'] = pgAfterRepDive(extras['pg0'], extras['depth'], extras['abt'])}, 
        "altCondition": function () {return extras['abt']>extras['andl']}
    }, 
    "ML27": {
        "type": "w", 
        "outNode": "ML24", 
        "message": "EXCEEDS LIMIT"
    }, 
    "ML28": {
        "type": "d", 
        "outNode": "ML-L2-1", 
        "message": "PG AFTER LVL 1 $var", 
        "variable": "pg1"
    }, 
    "ML-L2-1": {
        "type": "i5", 
        "outNode": "ML-L2-2", 
        "message": "ENTER LVL 2 $number", 
        "variable": "depth2", 
        "postNodeJS": function () {extras['depth2'] = nearestDepth(local)}
    }, 
    "ML-L2-2": {
        "type": "c", 
        "outNode": "ML-L2-3", 
        "outNodeAlt": "ML29", 
        "message": "no input?", 
        "postNodeJS": function () {extras['finalPG'] = extras['pg1']}, 
        "altCondition": function () {return extras['depth2']==''}
    }, 
    "ML-L2-3": {
        "type": "c", 
        "outNode": "ML-L2-5", 
        "outNodeAlt": "ML-L2-4", 
        "message": "exceed ml ascent rule?", 
        "preNodeJS": function () {extras['asLimit'] = ascentLimit(extras['depth'])}, 
        "altCondition": function () {return extras['depth2'] > extras['asLimit'] || extras['depth2']==-1}
    }, 
    "ML-L2-4": {
        "type": "w", 
        "outNode": "ML-L2-1", 
        "message": "EXCEEDS ML --ASCENT LIMIT"
    }, 
    "ML-L2-5": {
        "type": "d", 
        "outNode": "ML-L2-6", 
        "message": "ML   $var MIN", 
        "variable": "mlLimit2", 
        "preNodeJS": function () {local = mlLimit(extras['pg1'], extras['depth2'])}
    }, 
    "ML-L2-6": {
        "type": "i3", 
        "outNode": "ML-L2-7", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt2"
    }, 
    "ML-L2-7": {
        "type": "c", 
        "outNode": "ML-L2-9", 
        "outNodeAlt": "ML-L2-8", 
        "message": "ml limit exceeded?", 
        "altCondition": function () {return extras['abt2'] > extras['mlLimit2']}
    }, 
    "ML-L2-8": {
        "type": "w", 
        "outNode": "ML-L2-5", 
        "message": "EXCEEDS LIMIT"
    }, 
    "ML-L2-9": {
        "type": "d", 
        "outNode": "ML-L3-1", 
        "message": "PG AFTER LVL 2 $var", 
        "variable": "pg2", 
        "preNodeJS": function () {local = pgAfterMLDive(extras['pg1'], extras['depth2'], extras['abt2'])}
    }, 
    "ML-L3-1": {
        "type": "i5", 
        "outNode": "ML-L3-2", 
        "message": "ENTER LVL 3 $number", 
        "variable": "depth3", 
        "postNodeJS": function () {extras['depth3'] = nearestDepth(local)}
    }, 
    "ML-L3-2": {
        "type": "c", 
        "outNode": "ML-L3-3", 
        "outNodeAlt": "ML29", 
        "message": "no input?", 
        "postNodeJS": function () {extras['finalPG'] = extras['pg2']}, 
        "altCondition": function () {return extras['depth3']==''}
    }, 
    "ML-L3-3": {
        "type": "c", 
        "outNode": "ML-L3-5", 
        "outNodeAlt": "ML-L3-4", 
        "message": "exceed ml ascent rule?", 
        "preNodeJS": function () {extras['asLimit'] = ascentLimit(extras['depth2'])}, 
        "altCondition": function () {return extras['depth3'] > extras['asLimit'] || extras['depth3'] == -1}
    }, 
    "ML-L3-4": {
        "type": "w", 
        "outNode": "ML-L3-1", 
        "message": "EXCEEDS ML --ASCENT LIMIT"
    }, 
    "ML-L3-5": {
        "type": "d", 
        "outNode": "ML-L3-6", 
        "message": "ML   $var MIN", 
        "variable": "mlLimit3", 
        "preNodeJS": function () {local = mlLimit(extras['pg2'], extras['depth3'])}
    }, 
    "ML-L3-6": {
        "type": "i3", 
        "outNode": "ML-L3-7", 
        "message": "ENTER ABT $numberMIN", 
        "variable": "abt3"
    }, 
    "ML-L3-7": {
        "type": "c", 
        "outNode": "ML29", 
        "outNodeAlt": "ML-L3-8", 
        "message": "ml limit exceeded?", 
        "postNodeJS": function () {extras['finalPG'] = pgAfterMLDive(extras['pg2'], extras['depth3'], extras['abt3'])}, 
        "altCondition": function () {return extras['abt3'] > extras['mlLimit3']}
    }, 
    "ML-L3-8": {
        "type": "w", 
        "outNode": "ML-L3-5", 
        "message": "EXCEEDS LIMIT"
    }, 
    "ML29": {
        "type": "c", 
        "outNode": "ML31", 
        "outNodeAlt": "ML30", 
        "message": "safety stop?", 
        "altCondition": function () {return extras['stop']}
    }, 
    "ML30": {
        "type": "w", 
        "outNode": "ML31", 
        "message": "SAFETY STOP  3MIN --SEE RULE 2"
    }, 
    "ML31": {
        "type": "d", 
        "outNode": "ML6", 
        "message": "PG AFTER DIVE $var", 
        "variable": "finalPG", 
        "postNodeJS": function () {extras['pg'] = extras['finalPG']}
    }
}

////////////////////////
// NODE FUNCTIONS
// (functions needed by the the dive planner)

// testing fxns
function assert(expected, actual, desc){
    if (expected != actual){
        //console.log("failed: " + desc + "(got "+ actual + ", expected " + expected + ")");
    } else {
        ////console.log("passed: " + desc);
    }
}
function test(){
    //console.log("starting testing");
    // max depth
    //console.log("testing max depth");
    unit = 'm';
    assert(34, calcMaxDepth(15), 'max depth (m)');
    assert(24, calcMaxDepth(30), 'max depth (m)');
    assert(20, calcMaxDepth(40), 'max depth (m)');
    assert(-1, calcMaxDepth(220), 'max depth (m)');
    unit = 'm';
    assert(18, calcMaxDepthRep(30, 'G'), 'max depth repetitive (m)');
    assert(18, calcMaxDepthRep(20, 'K'), 'max depth repetitive (m)');
    assert(-1, calcMaxDepthRep(30, 'Z'), 'max depth repetitive (m)');
    assert(20, calcMaxDepthRep(30, 'B'), 'max depth repetitive (m)');
    assert(12, calcMaxDepthRep(76, 'P'), 'max depth repetitive (m)');
    unit = 'ft';
    assert(110, calcMaxDepth(15), 'max depth repetitive (ft)');
    assert(80, calcMaxDepth(30), 'max depth repetitive (ft)');
    assert(70, calcMaxDepth(40), 'max depth repetitive (ft)');
    assert(-1, calcMaxDepth(220), 'max depth repetitive (ft)');
    unit = 'ft';
    assert(60, calcMaxDepthRep(30, 'G'), 'max depth repetitive (ft)');
    assert(-1, calcMaxDepthRep(30, 'Z'), 'max depth repetitive (ft)');
    assert(70, calcMaxDepthRep(30, 'B'), 'max depth repetitive (ft)');
    assert(35, calcMaxDepthRep(76, 'P'), 'max depth repetitive (ft)');

    //console.log("testing firstPG");
    unit = 'm';
    assert('K', firstPG(16,33), 'first PG');
    assert('K', firstPG(16,34), 'first PG');
    assert('M', firstPG(14,45), 'first PG');
    assert('E', firstPG(40,7), 'first PG');

    //console.log("testing minRepPG");
    unit = 'm';
    assert('R', minRepPG(16, 18), 'minRepPG');

    unit = 'm';

    // calc PG after SI
    unit = 'm';
    assert('G', calcPGafterSI('J', 20), "pg after si");

    // pg after rep dive
    unit = 'm';
    assert('T', pgAfterRepDive('D', nearestDepth(13), 50), "pg after rep dive");
    assert('P', pgAfterRepDive('G', nearestDepth(26), 12), "pg after rep dive");


    // pg after ML dive
    unit = 'm';
    assert('K', pgAfterMLDive('J', nearestDepth(8), 5), "pg after ml dive");
    assert('R', pgAfterMLDive('Q', nearestDepth(8), 5), "pg after ml dive");
    assert('J', pgAfterMLDive('G', nearestDepth(10), 10), "pg after ml dive");
    assert('Q', pgAfterMLDive('O', nearestDepth(10), 10), "pg after ml dive");
}

// calculation functions

function nearestDepth(depth){
    if (depth == '')
        return '';
    var table = (unit == 'm')? DepthTableM: DepthTableFT;
    var limit = (unit == 'm')? 40: 130;
    if (depth > limit)
        return -1; // exceeds limit
    for (var i in table){
        if (depth <= i)
            return i;
    }
    return -1; // exceed limit
}

function NDL(depth){
    // depth should first calculate nearest depth
    var table = (unit == 'm')? NDLTableM : NDLTableFT;
    return table[depth];
}

function firstPG(depth, ABT){ 
// RNT = 34
// ABT = 13
// TBT = 47 -> ABT = 47
// depth = 18

    // calculates the pg after first dive
    var row = (unit == 'm')? DepthTableM[depth] : DepthTableFT[depth];
    var limit = (unit == 'm')? 30: 100; // because of error in the table...
    for (var i in row){
        if (row[i]['time'] != 0 && row[i]['time'] >= ABT){
            extras['stop'] = row[i]['safetyStop'];
            if (depth >= limit)
                extras['stop'] = true;
            return row[i]['PG'];
        }
    }
    return -1;
}

function pgAfterRepDive(PG, depth, ABT){
    // calculates pg after repetitive dive

    var table = (unit=='m')? RDTableM : RDTableFT;

    // find the cell, to find the RNT
    var col = 0;
    for (; col < table[PG].length; col++){
        if (table[PG][col]['depth'] == depth)
            break;
    }
    var RNT = table[PG][col]['RNT'];
    
    var TBT = RNT + ABT; // total bottom time

    // the resulting pg (also sets safety stop in $stop)
    return firstPG(depth, RNT + ABT);
}

function ANDL(pg, depth){ // first calculate nearest depth
    // repetitive dive table, go right from depth, to the end
    var row = (unit=='m')? RDTableM[pg] : RDTableFT[pg];
    for (var i in row){
        if (row[i]['depth'] == depth)
            return row[i]['ANDL'];
    }
    return -1;
}

function minRepPG(depth, time){ // depth should be nearest depth
    var table = (unit=='m')? RDTableM : RDTableFT;
    // find the column
    var col = 0;
    for (; col < table['A'].length; col++){
        if (table['A'][col]['depth'] == depth)
            break;
    }

    var PG = -1;
    var rnt = 0;
    for (var i in table){
        if(table[i][col] === undefined)
            break;
        if(table[i][col]['ANDL'] < time)
            break;
        PG = i;
        rnt = table[i][col]['RNT'];
    }

    // the resulting pg -- to set the safety stop in $stop
    firstPG(depth, rnt + time);
    
    return PG;
}

function minSI(PG1, PG2){
    // lookup SI table, with PG1 / PG2
    if (PG1 <= PG2)
        return 0;
    var min = -1;
    for (var i in SITable[PG1]){
        if (SITable[PG1][i]['PG2'] == PG2)
            return SITable[PG1][i]['min'];
    }
    return -1; // mins
}

function toStr(num, digits){
    var value = '';
    for (var i = 0; i < digits; i++){
        value = '' + num % 10 + value;
        num = Math.floor(num/10);
    }
    return value;
}

function toHrMin(min){
    var hr = Math.floor(min/60);
    min = min % 60;
    return toStr(hr, 2) + 'H:' + toStr(min,2) + 'M';
}

function calcMinSI(depth1, time1, depth2, time2){
    // find the minimum SI needed between two dives
    // just for testing
    var PG1 = firstPG(nearestDepth(depth1), time1);
    var PG2 = minRepPG(nearestDepth(depth2), time2);
    return minSI(PG1, PG2);
}

function calcPGafterSI(PG1, SI){
    //finds the PG after SI 
    var last_pg = -1;
    for (var i in SITable[PG1]){
        if (SITable[PG1][i]['min'] > SI) 
            return last_pg;
        last_pg = SITable[PG1][i]['PG2'];
    }
    return -1; // no residual nitrogen -> new dive (rule 11)
}

function calcMaxDepth(diveTime){
    var table = (unit=='m')? NDLTableM : NDLTableFT;
    var limit = (unit=='m')? 40: 130;
    var depth = -1;
    for (var i in table){
        if (diveTime > table[i])
            break;
        depth = i;
    }
    if (depth > limit)
        depth = limit;
   	//[LMNT 20150610] Added to set the "stop" flag properly. 
   	firstPG(depth,diveTime);

    return depth;
}

function pgANDL(pressureGroup) {
    var row = (unit=='m')? RDTableM[pressureGroup] : RDTableFT[pressureGroup];
    return row[0]['ANDL'];
    
}
function calcMaxDepthRep(diveTime, pressureGroup){
    //console.log("calcMaxDepthRep (" + diveTime+',' +pressureGroup+')');
    var row = (unit=='m')? RDTableM[pressureGroup] : RDTableFT[pressureGroup];
    var limit = (unit=='m')? 40: 130;
    var depth = -1;
    for (var i in row){
        var item = row[i]
        if (diveTime > item['ANDL'])
            break;
        depth = item['depth'];
        //console.log(item['RNT'])
    }
    if (depth > limit)
        depth = limit;
   	//[LMNT 20150610] Added to set the "stop" flag properly. 
   	firstPG(depth,diveTime);
    return depth;
}

function mlLimit(PG, depth) { // depth needs to use nearest depth
    // repetitive dive table, go right from depth, to the end
    var row = (unit=='m')? RDTableM[PG] : RDTableFT[PG];
    for (var i in row){
        if (row[i]['depth'] == depth)
            return row[i]['ml-ANDL'];
    }
    return -1;
}

function pgAfterMLDive(PG, depth, ABT){
    // calculates pg after repetitive dive

    var table = (unit=='m')? RDTableM : RDTableFT;

    // find the cell, to find the RNT
    var col = 0;
    for (; col < table[PG].length; col++){
        if (table[PG][col]['depth'] == depth)
            break;
    }
    var RNT = table[PG][col]['ml-RNT'];
    
    var TBT = RNT + ABT; // total bottom time

    // look for the pg with (depth, TBT) in repetitive dive table
    var endPG = '-1';

    // LMNT 20150603 This lookup on Table 3 becomes useless

    /*for (var pgCode = PG.charCodeAt(0); pgCode <= "Z".charCodeAt(0); pgCode++){ 
        endPG = String.fromCharCode(pgCode);
        //if (table[endPG][col]['ml-RNT'] >= TBT)
        //LMNT20141203 - changed ml-RNT to RNT at Gina Shean's request
        if (table[endPG][col]['RNT'] >= TBT)
            break;
    }*/

    // LMNT 20150603 Instead, table 1 is used via firstPG function
    endPG = firstPG(depth, TBT);

    // set the safety stop correctly
    //var newSS = firstPG(depth, TBT);
    // LMNT1217: Enabled previously commented code which bears in mind 
    // previous safety stop, and compares to current one. 
    var oldSS = extras['stop'] == true
    var newSS = firstPG(depth, TBT);
    extras['stop'] = oldSS || newSS; // TODO: check if this is correct

    return endPG;
}

function ascentLimit(depth) {
    var table = (unit == 'm')? ascentLimitTableM : ascentLimitTableFT;
    var limit = table[0][1];
    for(var i = 0; i < table.length; i++){
        if (depth <= table[i][0])
            return table[i][1];
    }
    return table[table.length-1][1];
}

/////////////////////
// Data Tables
//
// tables:
//    ascentLimitTable
//    Depth Table 
//    DepthTableM / DepthTableFT
//         time
//         depth (index)
//         PG
//         safetyStop (t/f)
//    
//    NDLTable - no decompression limit 
//    NDLTableM / NDLTableFT
//   
//    RD Table - Repetitive dive table
//    RDTableM / RDTableFT
//         RNT - residual nitrogen time (to be added for next dive)
//         ANDL- adjusted no decompression limit
//         ml-RNT - residual nitrogen time (to be added for next dive)
//         ml-ANDL- adjusted no decompression limit
//         PG  - pressure group (index)
//         depth
//   
//    SITable
//         min - min time to go from PG1 to PG2... (actually minutes)
//         PG1 (index)
//         PG2
//   

ascentLimitTableM = [
    [20, 12,],
    [26, 16, ],
    [32, 20,],
    [38, 24,],
    [40, 26,],
]

ascentLimitTableFT = [
    [60, 40,],
    [75, 50,],
    [90, 60,],
    [110, 70,],
    [130, 80,],
]

// RDTableM = //Original Table
// {
// "A": [{"RNT": 10, "ANDL": 209, "PG": "A", "depth": 10, "ml-RNT": 10, "ml-ANDL": 190}, {"RNT": 9, "ANDL": 138, "PG": "A", "depth": 12, "ml-RNT": 9, "ml-ANDL": 123}, {"RNT": 8, "ANDL": 90, "PG": "A", "depth": 14, "ml-RNT": 8, "ml-ANDL": 79}, {"RNT": 7, "ANDL": 65, "PG": "A", "depth": 16, "ml-RNT": 7, "ml-ANDL": 56}, {"RNT": 6, "ANDL": 50, "PG": "A", "depth": 18, "ml-RNT": 6, "ml-ANDL": 41}, {"RNT": 6, "ANDL": 39, "PG": "A", "depth": 20, "ml-RNT": 6, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 32, "PG": "A", "depth": 22, "ml-RNT": 5, "ml-ANDL": 28}, {"RNT": 4, "ANDL": 27, "PG": "A", "depth": 24, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 26, "ml-RNT": 4, "ml-ANDL": 20}, {"RNT": 3, "ANDL": 20, "PG": "A", "depth": 28}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 30}, {"RNT": 3, "ANDL": 14, "PG": "A", "depth": 32}, {"RNT": 3, "ANDL": 12, "PG": "A", "depth": 34}, {"RNT": 2, "ANDL": 11, "PG": "A", "depth": 36}, {"RNT": 2, "ANDL": 9, "PG": "A", "depth": 38}, {"RNT": 2, "ANDL": 7, "PG": "A", "depth": 40}], 
// "B": [{"RNT": 20, "ANDL": 199, "PG": "B", "depth": 10, "ml-RNT": 20, "ml-ANDL": 180}, {"RNT": 17, "ANDL": 130, "PG": "B", "depth": 12, "ml-RNT": 17, "ml-ANDL": 115}, {"RNT": 15, "ANDL": 83, "PG": "B", "depth": 14, "ml-RNT": 15, "ml-ANDL": 72}, {"RNT": 13, "ANDL": 59, "PG": "B", "depth": 16, "ml-RNT": 13, "ml-ANDL": 50}, {"RNT": 11, "ANDL": 45, "PG": "B", "depth": 18, "ml-RNT": 11, "ml-ANDL": 36}, {"RNT": 10, "ANDL": 35, "PG": "B", "depth": 20, "ml-RNT": 10, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 28, "PG": "B", "depth": 22, "ml-RNT": 9, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 23, "PG": "B", "depth": 24, "ml-RNT": 8, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 26, "ml-RNT": 7, "ml-ANDL": 17}, {"RNT": 6, "ANDL": 17, "PG": "B", "depth": 28}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 30}, {"RNT": 5, "ANDL": 12, "PG": "B", "depth": 32}, {"RNT": 5, "ANDL": 10, "PG": "B", "depth": 34}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 36}, {"RNT": 5, "ANDL": 6, "PG": "B", "depth": 38}, {"RNT": 5, "ANDL": 4, "PG": "B", "depth": 40}], 
// "C": [{"RNT": 26, "ANDL": 193, "PG": "C", "depth": 10, "ml-RNT": 26, "ml-ANDL": 174}, {"RNT": 23, "ANDL": 124, "PG": "C", "depth": 12, "ml-RNT": 23, "ml-ANDL": 109}, {"RNT": 19, "ANDL": 79, "PG": "C", "depth": 14, "ml-RNT": 19, "ml-ANDL": 68}, {"RNT": 17, "ANDL": 55, "PG": "C", "depth": 16, "ml-RNT": 17, "ml-ANDL": 46}, {"RNT": 15, "ANDL": 41, "PG": "C", "depth": 18, "ml-RNT": 15, "ml-ANDL": 32}, {"RNT": 13, "ANDL": 32, "PG": "C", "depth": 20, "ml-RNT": 13, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 25, "PG": "C", "depth": 22, "ml-RNT": 12, "ml-ANDL": 21}, {"RNT": 10, "ANDL": 21, "PG": "C", "depth": 24, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 18, "PG": "C", "depth": 26, "ml-RNT": 9, "ml-ANDL": 15}, {"RNT": 8, "ANDL": 15, "PG": "C", "depth": 28}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 30}, {"RNT": 7, "ANDL": 10, "PG": "C", "depth": 32}, {"RNT": 7, "ANDL": 8, "PG": "C", "depth": 34}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 36}, {"RNT": 6, "ANDL": 5, "PG": "C", "depth": 38}, {"RNT": 6, "ANDL": 3, "PG": "C", "depth": 40}], 
// "D": [{"RNT": 30, "ANDL": 189, "PG": "D", "depth": 10, "ml-RNT": 30, "ml-ANDL": 170}, {"RNT": 26, "ANDL": 121, "PG": "D", "depth": 12, "ml-RNT": 26, "ml-ANDL": 106}, {"RNT": 22, "ANDL": 76, "PG": "D", "depth": 14, "ml-RNT": 22, "ml-ANDL": 65}, {"RNT": 19, "ANDL": 53, "PG": "D", "depth": 16, "ml-RNT": 19, "ml-ANDL": 43}, {"RNT": 16, "ANDL": 40, "PG": "D", "depth": 18, "ml-RNT": 16, "ml-ANDL": 31}, {"RNT": 15, "ANDL": 30, "PG": "D", "depth": 20, "ml-RNT": 15, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 24, "PG": "D", "depth": 22, "ml-RNT": 13, "ml-ANDL": 20}, {"RNT": 11, "ANDL": 20, "PG": "D", "depth": 24, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 26, "ml-RNT": 10, "ml-ANDL": 14}, {"RNT": 9, "ANDL": 14, "PG": "D", "depth": 28}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 30}, {"RNT": 8, "ANDL": 9, "PG": "D", "depth": 32}, {"RNT": 8, "ANDL": 7, "PG": "D", "depth": 34}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 36}, {"RNT": 7, "ANDL": 4, "PG": "D", "depth": 38}, {"RNT": 7, "ANDL": 0, "PG": "D", "depth": 40}], 
// "E": [{"RNT": 34, "ANDL": 185, "PG": "E", "depth": 10, "ml-RNT": 34, "ml-ANDL": 166}, {"RNT": 29, "ANDL": 118, "PG": "E", "depth": 12, "ml-RNT": 29, "ml-ANDL": 103}, {"RNT": 24, "ANDL": 74, "PG": "E", "depth": 14, "ml-RNT": 24, "ml-ANDL": 63}, {"RNT": 21, "ANDL": 51, "PG": "E", "depth": 16, "ml-RNT": 21, "ml-ANDL": 42}, {"RNT": 18, "ANDL": 38, "PG": "E", "depth": 18, "ml-RNT": 18, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 20, "ml-RNT": 16, "ml-ANDL": 24}, {"RNT": 15, "ANDL": 22, "PG": "E", "depth": 22, "ml-RNT": 15, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 18, "PG": "E", "depth": 24, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 11, "ANDL": 16, "PG": "E", "depth": 26, "ml-RNT": 11, "ml-ANDL": 13}, {"RNT": 11, "ANDL": 12, "PG": "E", "depth": 28}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 30}, {"RNT": 9, "ANDL": 8, "PG": "E", "depth": 32}, {"RNT": 8, "ANDL": 7, "PG": "E", "depth": 34}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 36}, {"RNT": 8, "ANDL": 3, "PG": "E", "depth": 38}, {"RNT": 7, "ANDL": 0, "PG": "E", "depth": 40}], 
// "F": [{"RNT": 37, "ANDL": 182, "PG": "F", "depth": 10, "ml-RNT": 37, "ml-ANDL": 163}, {"RNT": 32, "ANDL": 115, "PG": "F", "depth": 12, "ml-RNT": 32, "ml-ANDL": 100}, {"RNT": 27, "ANDL": 71, "PG": "F", "depth": 14, "ml-RNT": 27, "ml-ANDL": 60}, {"RNT": 23, "ANDL": 49, "PG": "F", "depth": 16, "ml-RNT": 23, "ml-ANDL": 40}, {"RNT": 20, "ANDL": 36, "PG": "F", "depth": 18, "ml-RNT": 20, "ml-ANDL": 27}, {"RNT": 18, "ANDL": 27, "PG": "F", "depth": 20, "ml-RNT": 18, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 21, "PG": "F", "depth": 22, "ml-RNT": 16, "ml-ANDL": 17}, {"RNT": 14, "ANDL": 17, "PG": "F", "depth": 24, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 26, "ml-RNT": 13, "ml-ANDL": 11}, {"RNT": 12, "ANDL": 11, "PG": "F", "depth": 28}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 30}, {"RNT": 10, "ANDL": 7, "PG": "F", "depth": 32}, {"RNT": 9, "ANDL": 6, "PG": "F", "depth": 34}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 36}, {"RNT": 9, "ANDL": 0, "PG": "F", "depth": 38}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 40}], 
// "G": [{"RNT": 41, "ANDL": 178, "PG": "G", "depth": 10, "ml-RNT": 41, "ml-ANDL": 159}, {"RNT": 35, "ANDL": 112, "PG": "G", "depth": 12, "ml-RNT": 36, "ml-ANDL": 96}, {"RNT": 29, "ANDL": 69, "PG": "G", "depth": 14, "ml-RNT": 29, "ml-ANDL": 58}, {"RNT": 25, "ANDL": 47, "PG": "G", "depth": 16, "ml-RNT": 25, "ml-ANDL": 38}, {"RNT": 22, "ANDL": 34, "PG": "G", "depth": 18, "ml-RNT": 22, "ml-ANDL": 25}, {"RNT": 20, "ANDL": 25, "PG": "G", "depth": 20, "ml-RNT": 20, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 19, "PG": "G", "depth": 22, "ml-RNT": 18, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 16, "PG": "G", "depth": 24, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 26, "ml-RNT": 14, "ml-ANDL": 10}, {"RNT": 13, "ANDL": 10, "PG": "G", "depth": 28}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 30}, {"RNT": 11, "ANDL": 6, "PG": "G", "depth": 32}, {"RNT": 10, "ANDL": 5, "PG": "G", "depth": 34}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 36}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 38}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 40}], 
// "H": [{"RNT": 45, "ANDL": 174, "PG": "H", "depth": 10, "ml-RNT": 45, "ml-ANDL": 155}, {"RNT": 38, "ANDL": 109, "PG": "H", "depth": 12, "ml-RNT": 38, "ml-ANDL": 94}, {"RNT": 32, "ANDL": 66, "PG": "H", "depth": 14, "ml-RNT": 32, "ml-ANDL": 55}, {"RNT": 27, "ANDL": 45, "PG": "H", "depth": 16, "ml-RNT": 27, "ml-ANDL": 36}, {"RNT": 24, "ANDL": 32, "PG": "H", "depth": 18, "ml-RNT": 24, "ml-ANDL": 23}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 20, "ml-RNT": 21, "ml-ANDL": 19}, {"RNT": 19, "ANDL": 18, "PG": "H", "depth": 22, "ml-RNT": 19, "ml-ANDL": 14}, {"RNT": 16, "ANDL": 15, "PG": "H", "depth": 24, "ml-RNT": 16, "ml-ANDL": 12}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 26, "ml-RNT": 15, "ml-ANDL": 9}, {"RNT": 14, "ANDL": 9, "PG": "H", "depth": 28}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 30}, {"RNT": 12, "ANDL": 5, "PG": "H", "depth": 32}, {"RNT": 11, "ANDL": 4, "PG": "H", "depth": 34}, {"RNT": 10, "ANDL": 3, "PG": "H", "depth": 36}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 38}], 
// "I": [{"RNT": 50, "ANDL": 169, "PG": "I", "depth": 10, "ml-RNT": 50, "ml-ANDL": 150}, {"RNT": 42, "ANDL": 105, "PG": "I", "depth": 12, "ml-RNT": 42, "ml-ANDL": 90}, {"RNT": 35, "ANDL": 63, "PG": "I", "depth": 14, "ml-RNT": 35, "ml-ANDL": 52}, {"RNT": 29, "ANDL": 43, "PG": "I", "depth": 16, "ml-RNT": 29, "ml-ANDL": 34}, {"RNT": 26, "ANDL": 30, "PG": "I", "depth": 18, "ml-RNT": 26, "ml-ANDL": 21}, {"RNT": 23, "ANDL": 22, "PG": "I", "depth": 20, "ml-RNT": 23, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 16, "PG": "I", "depth": 22, "ml-RNT": 21, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 13, "PG": "I", "depth": 24, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 26, "ml-RNT": 16, "ml-ANDL": 8}, {"RNT": 15, "ANDL": 8, "PG": "I", "depth": 28}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 30}, {"RNT": 13, "ANDL": 4, "PG": "I", "depth": 32}, {"RNT": 12, "ANDL": 3, "PG": "I", "depth": 34}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 36}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 38}], 
// "J": [{"RNT": 54, "ANDL": 165, "PG": "J", "depth": 10, "ml-RNT": 54, "ml-ANDL": 146}, {"RNT": 45, "ANDL": 102, "PG": "J", "depth": 12, "ml-RNT": 45, "ml-ANDL": 87}, {"RNT": 37, "ANDL": 61, "PG": "J", "depth": 14, "ml-RNT": 37, "ml-ANDL": 50}, {"RNT": 32, "ANDL": 40, "PG": "J", "depth": 16, "ml-RNT": 32, "ml-ANDL": 31}, {"RNT": 28, "ANDL": 28, "PG": "J", "depth": 18, "ml-RNT": 28, "ml-ANDL": 19}, {"RNT": 25, "ANDL": 20, "PG": "J", "depth": 20, "ml-RNT": 25, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 15, "PG": "J", "depth": 22, "ml-RNT": 22, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 12, "PG": "J", "depth": 24, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 17, "ANDL": 10, "PG": "J", "depth": 26, "ml-RNT": 17, "ml-ANDL": 7}, {"RNT": 16, "ANDL": 7, "PG": "J", "depth": 28}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 30}, {"RNT": 14, "ANDL": 3, "PG": "J", "depth": 32}, {"RNT": 13, "ANDL": 0, "PG": "J", "depth": 34}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 36}], 
// "K": [{"RNT": 59, "ANDL": 160, "PG": "K", "depth": 10, "ml-RNT": 59, "ml-ANDL": 141}, {"RNT": 49, "ANDL": 98, "PG": "K", "depth": 12, "ml-RNT": 49, "ml-ANDL": 83}, {"RNT": 40, "ANDL": 58, "PG": "K", "depth": 14, "ml-RNT": 40, "ml-ANDL": 47}, {"RNT": 34, "ANDL": 38, "PG": "K", "depth": 16, "ml-RNT": 34, "ml-ANDL": 29}, {"RNT": 30, "ANDL": 26, "PG": "K", "depth": 18, "ml-RNT": 30, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 20, "ml-RNT": 26, "ml-ANDL": 14}, {"RNT": 24, "ANDL": 13, "PG": "K", "depth": 22, "ml-RNT": 24, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 10, "PG": "K", "depth": 24, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 26, "ml-RNT": 19, "ml-ANDL": 5}, {"RNT": 17, "ANDL": 6, "PG": "K", "depth": 28}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 30}, {"RNT": 15, "ANDL": 0, "PG": "K", "depth": 32}, {"RNT": 14, "ANDL": 0, "PG": "K", "depth": 34}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 36}], 
// "L": [{"RNT": 64, "ANDL": 155, "PG": "L", "depth": 10, "ml-RNT": 64, "ml-ANDL": 136}, {"RNT": 53, "ANDL": 94, "PG": "L", "depth": 12, "ml-RNT": 53, "ml-ANDL": 79}, {"RNT": 43, "ANDL": 55, "PG": "L", "depth": 14, "ml-RNT": 43, "ml-ANDL": 44}, {"RNT": 37, "ANDL": 35, "PG": "L", "depth": 16, "ml-RNT": 37, "ml-ANDL": 26}, {"RNT": 32, "ANDL": 24, "PG": "L", "depth": 18, "ml-RNT": 32, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 20, "ml-RNT": 28, "ml-ANDL": 12}, {"RNT": 25, "ANDL": 12, "PG": "L", "depth": 22, "ml-RNT": 25, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 9, "PG": "L", "depth": 24, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 26, "ml-RNT": 20, "ml-ANDL": 4}, {"RNT": 18, "ANDL": 5, "PG": "L", "depth": 28}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 30}, {"RNT": 16, "ANDL": 0, "PG": "L", "depth": 32}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 34}], 
// "M": [{"RNT": 70, "ANDL": 149, "PG": "M", "depth": 10, "ml-RNT": 70, "ml-ANDL": 130}, {"RNT": 57, "ANDL": 90, "PG": "M", "depth": 12, "ml-RNT": 57, "ml-ANDL": 75}, {"RNT": 47, "ANDL": 51, "PG": "M", "depth": 14, "ml-RNT": 47, "ml-ANDL": 40}, {"RNT": 39, "ANDL": 33, "PG": "M", "depth": 16, "ml-RNT": 39, "ml-ANDL": 24}, {"RNT": 34, "ANDL": 22, "PG": "M", "depth": 18, "ml-RNT": 34, "ml-ANDL": 13}, {"RNT": 30, "ANDL": 15, "PG": "M", "depth": 20, "ml-RNT": 30, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 10, "PG": "M", "depth": 22, "ml-RNT": 27, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 8, "PG": "M", "depth": 24, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 26, "ml-RNT": 21, "ml-ANDL": 3}, {"RNT": 20, "ANDL": 3, "PG": "M", "depth": 28}, {"RNT": 19, "ANDL": 0, "PG": "M", "depth": 30}, {"RNT": 17, "ANDL": 0, "PG": "M", "depth": 32}], 
// "N": [{"RNT": 75, "ANDL": 144, "PG": "N", "depth": 10, "ml-RNT": 75, "ml-ANDL": 125}, {"RNT": 62, "ANDL": 85, "PG": "N", "depth": 12, "ml-RNT": 62, "ml-ANDL": 70}, {"RNT": 50, "ANDL": 48, "PG": "N", "depth": 14, "ml-RNT": 50, "ml-ANDL": 37}, {"RNT": 42, "ANDL": 30, "PG": "N", "depth": 16, "ml-RNT": 42, "ml-ANDL": 21}, {"RNT": 36, "ANDL": 20, "PG": "N", "depth": 18, "ml-RNT": 36, "ml-ANDL": 11}, {"RNT": 32, "ANDL": 13, "PG": "N", "depth": 20, "ml-RNT": 32, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 8, "PG": "N", "depth": 22, "ml-RNT": 29, "ml-ANDL": 4}, {"RNT": 25, "ANDL": 6, "PG": "N", "depth": 24, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 26, "ml-RNT": 23}, {"RNT": 21, "ANDL": 0, "PG": "N", "depth": 28}, {"RNT": 20, "ANDL": 0, "PG": "N", "depth": 30}], 
// "O": [{"RNT": 82, "ANDL": 137, "PG": "O", "depth": 10, "ml-RNT": 82, "ml-ANDL": 118}, {"RNT": 66, "ANDL": 81, "PG": "O", "depth": 12, "ml-RNT": 66, "ml-ANDL": 66}, {"RNT": 53, "ANDL": 45, "PG": "O", "depth": 14, "ml-RNT": 53, "ml-ANDL": 34}, {"RNT": 45, "ANDL": 27, "PG": "O", "depth": 16, "ml-RNT": 45, "ml-ANDL": 18}, {"RNT": 39, "ANDL": 17, "PG": "O", "depth": 18, "ml-RNT": 39, "ml-ANDL": 8}, {"RNT": 34, "ANDL": 11, "PG": "O", "depth": 20, "ml-RNT": 34, "ml-ANDL": 6}, {"RNT": 30, "ANDL": 7, "PG": "O", "depth": 22, "ml-RNT": 30, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 5, "PG": "O", "depth": 24, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 26, "ml-RNT": 24}, {"RNT": 23, "ANDL": 0, "PG": "O", "depth": 28}], 
// "P": [{"RNT": 88, "ANDL": 131, "PG": "P", "depth": 10, "ml-RNT": 88, "ml-ANDL": 112}, {"RNT": 71, "ANDL": 76, "PG": "P", "depth": 12, "ml-RNT": 71, "ml-ANDL": 61}, {"RNT": 57, "ANDL": 41, "PG": "P", "depth": 14, "ml-RNT": 57, "ml-ANDL": 30}, {"RNT": 48, "ANDL": 24, "PG": "P", "depth": 16, "ml-RNT": 48, "ml-ANDL": 15}, {"RNT": 41, "ANDL": 15, "PG": "P", "depth": 18, "ml-RNT": 41, "ml-ANDL": 6}, {"RNT": 36, "ANDL": 9, "PG": "P", "depth": 20, "ml-RNT": 36, "ml-ANDL": 4}, {"RNT": 32, "ANDL": 5, "PG": "P", "depth": 22, "ml-RNT": 32}, {"RNT": 28, "ANDL": 3, "PG": "P", "depth": 24, "ml-RNT": 28}, {"RNT": 27, "ANDL": 0, "PG": "P", "depth": 26}], 
// "Q": [{"RNT": 95, "ANDL": 124, "PG": "Q", "depth": 10, "ml-RNT": 95, "ml-ANDL": 105}, {"RNT": 76, "ANDL": 71, "PG": "Q", "depth": 12, "ml-RNT": 76, "ml-ANDL": 56}, {"RNT": 61, "ANDL": 37, "PG": "Q", "depth": 14, "ml-RNT": 61, "ml-ANDL": 26}, {"RNT": 50, "ANDL": 22, "PG": "Q", "depth": 16, "ml-RNT": 50, "ml-ANDL": 13}, {"RNT": 43, "ANDL": 13, "PG": "Q", "depth": 18, "ml-RNT": 43, "ml-ANDL": 4}, {"RNT": 38, "ANDL": 7, "PG": "Q", "depth": 20, "ml-RNT": 38, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 3, "PG": "Q", "depth": 22, "ml-RNT": 33}, {"RNT": 29, "ANDL": 2, "PG": "Q", "depth": 24}], 
// "R": [{"RNT": 104, "ANDL": 115, "PG": "R", "depth": 10, "ml-RNT": 104, "ml-ANDL": 96}, {"RNT": 82, "ANDL": 65, "PG": "R", "depth": 12, "ml-RNT": 82, "ml-ANDL": 50}, {"RNT": 64, "ANDL": 34, "PG": "R", "depth": 14, "ml-RNT": 64, "ml-ANDL": 23}, {"RNT": 53, "ANDL": 19, "PG": "R", "depth": 16, "ml-RNT": 53, "ml-ANDL": 10}, {"RNT": 46, "ANDL": 10, "PG": "R", "depth": 18, "ml-RNT": 47}, {"RNT": 40, "ANDL": 5, "PG": "R", "depth": 20, "ml-RNT": 40}, {"RNT": 36, "ANDL": 0, "PG": "R", "depth": 22}, {"RNT": 31, "ANDL": 0, "PG": "R", "depth": 24}], 
// "S": [{"RNT": 112, "ANDL": 107, "PG": "S", "depth": 10, "ml-RNT": 112, "ml-ANDL": 88}, {"RNT": 88, "ANDL": 59, "PG": "S", "depth": 12, "ml-RNT": 88, "ml-ANDL": 44}, {"RNT": 68, "ANDL": 30, "PG": "S", "depth": 14, "ml-RNT": 68, "ml-ANDL": 19}, {"RNT": 56, "ANDL": 16, "PG": "S", "depth": 16, "ml-RNT": 56, "ml-ANDL": 7}, {"RNT": 48, "ANDL": 8, "PG": "S", "depth": 18}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 20}, {"RNT": 37, "ANDL": 0, "PG": "S", "depth": 22}], 
// "T": [{"RNT": 122, "ANDL": 97, "PG": "T", "depth": 10, "ml-RNT": 122, "ml-ANDL": 78}, {"RNT": 94, "ANDL": 53, "PG": "T", "depth": 12, "ml-RNT": 94, "ml-ANDL": 38}, {"RNT": 73, "ANDL": 25, "PG": "T", "depth": 14, "ml-RNT": 73, "ml-ANDL": 14}, {"RNT": 60, "ANDL": 12, "PG": "T", "depth": 16, "ml-RNT": 60, "ml-ANDL": 3}, {"RNT": 51, "ANDL": 5, "PG": "T", "depth": 18}, {"RNT": 44, "ANDL": 0, "PG": "T", "depth": 20}], 
// "U": [{"RNT": 133, "ANDL": 86, "PG": "U", "depth": 10, "ml-RNT": 133, "ml-ANDL": 67}, {"RNT": 101, "ANDL": 46, "PG": "U", "depth": 12, "ml-RNT": 101, "ml-ANDL": 31}, {"RNT": 77, "ANDL": 21, "PG": "U", "depth": 14, "ml-RNT": 77, "ml-ANDL": 10}, {"RNT": 63, "ANDL": 9, "PG": "U", "depth": 16, "ml-RNT": 63}, {"RNT": 53, "ANDL": 3, "PG": "U", "depth": 18}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 20}], 
// "V": [{"RNT": 145, "ANDL": 74, "PG": "V", "depth": 10, "ml-RNT": 145, "ml-ANDL": 55}, {"RNT": 108, "ANDL": 39, "PG": "V", "depth": 12, "ml-RNT": 108, "ml-ANDL": 24}, {"RNT": 82, "ANDL": 16, "PG": "V", "depth": 14, "ml-RNT": 82, "ml-ANDL": 5}, {"RNT": 67, "ANDL": 5, "PG": "V", "depth": 16}, {"RNT": 55, "ANDL": 0, "PG": "V", "depth": 18}], 
// "W": [{"RNT": 160, "ANDL": 59, "PG": "W", "depth": 10, "ml-RNT": 160, "ml-ANDL": 40}, {"RNT": 116, "ANDL": 31, "PG": "W", "depth": 12, "ml-RNT": 116, "ml-ANDL": 16}, {"RNT": 87, "ANDL": 11, "PG": "W", "depth": 14, "ml-RNT": 87}, {"RNT": 70, "ANDL": 2, "PG": "W", "depth": 16}, {"RNT": 56, "ANDL": 0, "PG": "W", "depth": 18}], 
// "X": [{"RNT": 178, "ANDL": 41, "PG": "X", "depth": 10, "ml-RNT": 178, "ml-ANDL": 22}, {"RNT": 125, "ANDL": 22, "PG": "X", "depth": 12, "ml-RNT": 125, "ml-ANDL": 7}, {"RNT": 92, "ANDL": 6, "PG": "X", "depth": 14}, {"RNT": 72, "ANDL": 0, "PG": "X", "depth": 16}], 
// "Y": [{"RNT": 199, "ANDL": 20, "PG": "Y", "depth": 10, "ml-RNT": 199, "ml-ANDL": 0}, {"RNT": 134, "ANDL": 13, "PG": "Y", "depth": 12, "ml-RNT": 132}, {"RNT": 98, "ANDL": 0, "PG": "Y", "depth": 14}], 
// "Z": [{"RNT": 219, "ANDL": 0, "PG": "Z", "depth": 10, "ml-RNT": 200}, {"RNT": 147, "ANDL": 0, "PG": "Z", "depth": 12}]}

// RDTableM =  //[LMNT 20141208]: New table with "0" added
// {
// "A": [ {"RNT": 10, "ANDL": 209, "PG": "A", "depth": 10, "ml-RNT": 10, "ml-ANDL": 190}, {"RNT": 9, "ANDL": 138, "PG": "A", "depth": 12, "ml-RNT": 9, "ml-ANDL": 123}, {"RNT": 8, "ANDL": 90, "PG": "A", "depth": 14, "ml-RNT": 8, "ml-ANDL": 79}, {"RNT": 7, "ANDL": 65, "PG": "A", "depth": 16, "ml-RNT": 7, "ml-ANDL": 56}, {"RNT": 6, "ANDL": 50, "PG": "A", "depth": 18, "ml-RNT": 6, "ml-ANDL": 41}, {"RNT": 6, "ANDL": 39, "PG": "A", "depth": 20, "ml-RNT": 6, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 32, "PG": "A", "depth": 22, "ml-RNT": 5, "ml-ANDL": 28}, {"RNT": 4, "ANDL": 27, "PG": "A", "depth": 24, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 26, "ml-RNT": 4, "ml-ANDL": 20}, {"RNT": 3, "ANDL": 20, "PG": "A", "depth": 28}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 30}, {"RNT": 3, "ANDL": 14, "PG": "A", "depth": 32}, {"RNT": 3, "ANDL": 12, "PG": "A", "depth": 34}, {"RNT": 2, "ANDL": 11, "PG": "A", "depth": 36}, {"RNT": 2, "ANDL": 9, "PG": "A", "depth": 38}, {"RNT": 2, "ANDL": 7, "PG": "A", "depth": 40}], 
// "B": [ {"RNT": 20, "ANDL": 199, "PG": "B", "depth": 10, "ml-RNT": 20, "ml-ANDL": 180}, {"RNT": 17, "ANDL": 130, "PG": "B", "depth": 12, "ml-RNT": 17, "ml-ANDL": 115}, {"RNT": 15, "ANDL": 83, "PG": "B", "depth": 14, "ml-RNT": 15, "ml-ANDL": 72}, {"RNT": 13, "ANDL": 59, "PG": "B", "depth": 16, "ml-RNT": 13, "ml-ANDL": 50}, {"RNT": 11, "ANDL": 45, "PG": "B", "depth": 18, "ml-RNT": 11, "ml-ANDL": 36}, {"RNT": 10, "ANDL": 35, "PG": "B", "depth": 20, "ml-RNT": 10, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 28, "PG": "B", "depth": 22, "ml-RNT": 9, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 23, "PG": "B", "depth": 24, "ml-RNT": 8, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 26, "ml-RNT": 7, "ml-ANDL": 17}, {"RNT": 6, "ANDL": 17, "PG": "B", "depth": 28}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 30}, {"RNT": 5, "ANDL": 12, "PG": "B", "depth": 32}, {"RNT": 5, "ANDL": 10, "PG": "B", "depth": 34}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 36}, {"RNT": 5, "ANDL": 6, "PG": "B", "depth": 38}, {"RNT": 5, "ANDL": 4, "PG": "B", "depth": 40}], 
// "C": [ {"RNT": 26, "ANDL": 193, "PG": "C", "depth": 10, "ml-RNT": 26, "ml-ANDL": 174}, {"RNT": 23, "ANDL": 124, "PG": "C", "depth": 12, "ml-RNT": 23, "ml-ANDL": 109}, {"RNT": 19, "ANDL": 79, "PG": "C", "depth": 14, "ml-RNT": 19, "ml-ANDL": 68}, {"RNT": 17, "ANDL": 55, "PG": "C", "depth": 16, "ml-RNT": 17, "ml-ANDL": 46}, {"RNT": 15, "ANDL": 41, "PG": "C", "depth": 18, "ml-RNT": 15, "ml-ANDL": 32}, {"RNT": 13, "ANDL": 32, "PG": "C", "depth": 20, "ml-RNT": 13, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 25, "PG": "C", "depth": 22, "ml-RNT": 12, "ml-ANDL": 21}, {"RNT": 10, "ANDL": 21, "PG": "C", "depth": 24, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 18, "PG": "C", "depth": 26, "ml-RNT": 9, "ml-ANDL": 15}, {"RNT": 8, "ANDL": 15, "PG": "C", "depth": 28}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 30}, {"RNT": 7, "ANDL": 10, "PG": "C", "depth": 32}, {"RNT": 7, "ANDL": 8, "PG": "C", "depth": 34}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 36}, {"RNT": 6, "ANDL": 5, "PG": "C", "depth": 38}, {"RNT": 6, "ANDL": 3, "PG": "C", "depth": 40}], 
// "D": [ {"RNT": 30, "ANDL": 189, "PG": "D", "depth": 10, "ml-RNT": 30, "ml-ANDL": 170}, {"RNT": 26, "ANDL": 121, "PG": "D", "depth": 12, "ml-RNT": 26, "ml-ANDL": 106}, {"RNT": 22, "ANDL": 76, "PG": "D", "depth": 14, "ml-RNT": 22, "ml-ANDL": 65}, {"RNT": 19, "ANDL": 53, "PG": "D", "depth": 16, "ml-RNT": 19, "ml-ANDL": 43}, {"RNT": 16, "ANDL": 40, "PG": "D", "depth": 18, "ml-RNT": 16, "ml-ANDL": 31}, {"RNT": 15, "ANDL": 30, "PG": "D", "depth": 20, "ml-RNT": 15, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 24, "PG": "D", "depth": 22, "ml-RNT": 13, "ml-ANDL": 20}, {"RNT": 11, "ANDL": 20, "PG": "D", "depth": 24, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 26, "ml-RNT": 10, "ml-ANDL": 14}, {"RNT": 9, "ANDL": 14, "PG": "D", "depth": 28}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 30}, {"RNT": 8, "ANDL": 9, "PG": "D", "depth": 32}, {"RNT": 8, "ANDL": 7, "PG": "D", "depth": 34}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 36}, {"RNT": 7, "ANDL": 4, "PG": "D", "depth": 38}, {"RNT": 7, "ANDL": 0, "PG": "D", "depth": 40}], 
// "E": [ {"RNT": 34, "ANDL": 185, "PG": "E", "depth": 10, "ml-RNT": 34, "ml-ANDL": 166}, {"RNT": 29, "ANDL": 118, "PG": "E", "depth": 12, "ml-RNT": 29, "ml-ANDL": 103}, {"RNT": 24, "ANDL": 74, "PG": "E", "depth": 14, "ml-RNT": 24, "ml-ANDL": 63}, {"RNT": 21, "ANDL": 51, "PG": "E", "depth": 16, "ml-RNT": 21, "ml-ANDL": 42}, {"RNT": 18, "ANDL": 38, "PG": "E", "depth": 18, "ml-RNT": 18, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 20, "ml-RNT": 16, "ml-ANDL": 24}, {"RNT": 15, "ANDL": 22, "PG": "E", "depth": 22, "ml-RNT": 15, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 18, "PG": "E", "depth": 24, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 11, "ANDL": 16, "PG": "E", "depth": 26, "ml-RNT": 11, "ml-ANDL": 13}, {"RNT": 11, "ANDL": 12, "PG": "E", "depth": 28}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 30}, {"RNT": 9, "ANDL": 8, "PG": "E", "depth": 32}, {"RNT": 8, "ANDL": 7, "PG": "E", "depth": 34}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 36}, {"RNT": 8, "ANDL": 3, "PG": "E", "depth": 38}, {"RNT": 7, "ANDL": 0, "PG": "E", "depth": 40}], 
// "F": [ {"RNT": 37, "ANDL": 182, "PG": "F", "depth": 10, "ml-RNT": 37, "ml-ANDL": 163}, {"RNT": 32, "ANDL": 115, "PG": "F", "depth": 12, "ml-RNT": 32, "ml-ANDL": 100}, {"RNT": 27, "ANDL": 71, "PG": "F", "depth": 14, "ml-RNT": 27, "ml-ANDL": 60}, {"RNT": 23, "ANDL": 49, "PG": "F", "depth": 16, "ml-RNT": 23, "ml-ANDL": 40}, {"RNT": 20, "ANDL": 36, "PG": "F", "depth": 18, "ml-RNT": 20, "ml-ANDL": 27}, {"RNT": 18, "ANDL": 27, "PG": "F", "depth": 20, "ml-RNT": 18, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 21, "PG": "F", "depth": 22, "ml-RNT": 16, "ml-ANDL": 17}, {"RNT": 14, "ANDL": 17, "PG": "F", "depth": 24, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 26, "ml-RNT": 13, "ml-ANDL": 11}, {"RNT": 12, "ANDL": 11, "PG": "F", "depth": 28}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 30}, {"RNT": 10, "ANDL": 7, "PG": "F", "depth": 32}, {"RNT": 9, "ANDL": 6, "PG": "F", "depth": 34}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 36}, {"RNT": 9, "ANDL": 0, "PG": "F", "depth": 38}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 40}], 
// "G": [ {"RNT": 41, "ANDL": 178, "PG": "G", "depth": 10, "ml-RNT": 41, "ml-ANDL": 159}, {"RNT": 35, "ANDL": 112, "PG": "G", "depth": 12, "ml-RNT": 36, "ml-ANDL": 96}, {"RNT": 29, "ANDL": 69, "PG": "G", "depth": 14, "ml-RNT": 29, "ml-ANDL": 58}, {"RNT": 25, "ANDL": 47, "PG": "G", "depth": 16, "ml-RNT": 25, "ml-ANDL": 38}, {"RNT": 22, "ANDL": 34, "PG": "G", "depth": 18, "ml-RNT": 22, "ml-ANDL": 25}, {"RNT": 20, "ANDL": 25, "PG": "G", "depth": 20, "ml-RNT": 20, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 19, "PG": "G", "depth": 22, "ml-RNT": 18, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 16, "PG": "G", "depth": 24, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 26, "ml-RNT": 14, "ml-ANDL": 10}, {"RNT": 13, "ANDL": 10, "PG": "G", "depth": 28}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 30}, {"RNT": 11, "ANDL": 6, "PG": "G", "depth": 32}, {"RNT": 10, "ANDL": 5, "PG": "G", "depth": 34}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 36}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 38}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 40}], 
// "H": [ {"RNT": 45, "ANDL": 174, "PG": "H", "depth": 10, "ml-RNT": 45, "ml-ANDL": 155}, {"RNT": 38, "ANDL": 109, "PG": "H", "depth": 12, "ml-RNT": 38, "ml-ANDL": 94}, {"RNT": 32, "ANDL": 66, "PG": "H", "depth": 14, "ml-RNT": 32, "ml-ANDL": 55}, {"RNT": 27, "ANDL": 45, "PG": "H", "depth": 16, "ml-RNT": 27, "ml-ANDL": 36}, {"RNT": 24, "ANDL": 32, "PG": "H", "depth": 18, "ml-RNT": 24, "ml-ANDL": 23}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 20, "ml-RNT": 21, "ml-ANDL": 19}, {"RNT": 19, "ANDL": 18, "PG": "H", "depth": 22, "ml-RNT": 19, "ml-ANDL": 14}, {"RNT": 16, "ANDL": 15, "PG": "H", "depth": 24, "ml-RNT": 16, "ml-ANDL": 12}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 26, "ml-RNT": 15, "ml-ANDL": 9}, {"RNT": 14, "ANDL": 9, "PG": "H", "depth": 28}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 30}, {"RNT": 12, "ANDL": 5, "PG": "H", "depth": 32}, {"RNT": 11, "ANDL": 4, "PG": "H", "depth": 34}, {"RNT": 10, "ANDL": 3, "PG": "H", "depth": 36}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 38}], 
// "I": [ {"RNT": 50, "ANDL": 169, "PG": "I", "depth": 10, "ml-RNT": 50, "ml-ANDL": 150}, {"RNT": 42, "ANDL": 105, "PG": "I", "depth": 12, "ml-RNT": 42, "ml-ANDL": 90}, {"RNT": 35, "ANDL": 63, "PG": "I", "depth": 14, "ml-RNT": 35, "ml-ANDL": 52}, {"RNT": 29, "ANDL": 43, "PG": "I", "depth": 16, "ml-RNT": 29, "ml-ANDL": 34}, {"RNT": 26, "ANDL": 30, "PG": "I", "depth": 18, "ml-RNT": 26, "ml-ANDL": 21}, {"RNT": 23, "ANDL": 22, "PG": "I", "depth": 20, "ml-RNT": 23, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 16, "PG": "I", "depth": 22, "ml-RNT": 21, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 13, "PG": "I", "depth": 24, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 26, "ml-RNT": 16, "ml-ANDL": 8}, {"RNT": 15, "ANDL": 8, "PG": "I", "depth": 28}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 30}, {"RNT": 13, "ANDL": 4, "PG": "I", "depth": 32}, {"RNT": 12, "ANDL": 3, "PG": "I", "depth": 34}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 36}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 38}], 
// "J": [ {"RNT": 54, "ANDL": 165, "PG": "J", "depth": 10, "ml-RNT": 54, "ml-ANDL": 146}, {"RNT": 45, "ANDL": 102, "PG": "J", "depth": 12, "ml-RNT": 45, "ml-ANDL": 87}, {"RNT": 37, "ANDL": 61, "PG": "J", "depth": 14, "ml-RNT": 37, "ml-ANDL": 50}, {"RNT": 32, "ANDL": 40, "PG": "J", "depth": 16, "ml-RNT": 32, "ml-ANDL": 31}, {"RNT": 28, "ANDL": 28, "PG": "J", "depth": 18, "ml-RNT": 28, "ml-ANDL": 19}, {"RNT": 25, "ANDL": 20, "PG": "J", "depth": 20, "ml-RNT": 25, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 15, "PG": "J", "depth": 22, "ml-RNT": 22, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 12, "PG": "J", "depth": 24, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 17, "ANDL": 10, "PG": "J", "depth": 26, "ml-RNT": 17, "ml-ANDL": 7}, {"RNT": 16, "ANDL": 7, "PG": "J", "depth": 28}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 30}, {"RNT": 14, "ANDL": 3, "PG": "J", "depth": 32}, {"RNT": 13, "ANDL": 0, "PG": "J", "depth": 34}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 36}], 
// "K": [ {"RNT": 59, "ANDL": 160, "PG": "K", "depth": 10, "ml-RNT": 59, "ml-ANDL": 141}, {"RNT": 49, "ANDL": 98, "PG": "K", "depth": 12, "ml-RNT": 49, "ml-ANDL": 83}, {"RNT": 40, "ANDL": 58, "PG": "K", "depth": 14, "ml-RNT": 40, "ml-ANDL": 47}, {"RNT": 34, "ANDL": 38, "PG": "K", "depth": 16, "ml-RNT": 34, "ml-ANDL": 29}, {"RNT": 30, "ANDL": 26, "PG": "K", "depth": 18, "ml-RNT": 30, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 20, "ml-RNT": 26, "ml-ANDL": 14}, {"RNT": 24, "ANDL": 13, "PG": "K", "depth": 22, "ml-RNT": 24, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 10, "PG": "K", "depth": 24, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 26, "ml-RNT": 19, "ml-ANDL": 5}, {"RNT": 17, "ANDL": 6, "PG": "K", "depth": 28}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 30}, {"RNT": 15, "ANDL": 0, "PG": "K", "depth": 32}, {"RNT": 14, "ANDL": 0, "PG": "K", "depth": 34}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 36}], 
// "L": [ {"RNT": 64, "ANDL": 155, "PG": "L", "depth": 10, "ml-RNT": 64, "ml-ANDL": 136}, {"RNT": 53, "ANDL": 94, "PG": "L", "depth": 12, "ml-RNT": 53, "ml-ANDL": 79}, {"RNT": 43, "ANDL": 55, "PG": "L", "depth": 14, "ml-RNT": 43, "ml-ANDL": 44}, {"RNT": 37, "ANDL": 35, "PG": "L", "depth": 16, "ml-RNT": 37, "ml-ANDL": 26}, {"RNT": 32, "ANDL": 24, "PG": "L", "depth": 18, "ml-RNT": 32, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 20, "ml-RNT": 28, "ml-ANDL": 12}, {"RNT": 25, "ANDL": 12, "PG": "L", "depth": 22, "ml-RNT": 25, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 9, "PG": "L", "depth": 24, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 26, "ml-RNT": 20, "ml-ANDL": 4}, {"RNT": 18, "ANDL": 5, "PG": "L", "depth": 28}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 30}, {"RNT": 16, "ANDL": 0, "PG": "L", "depth": 32}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 34}], 
// "M": [ {"RNT": 70, "ANDL": 149, "PG": "M", "depth": 10, "ml-RNT": 70, "ml-ANDL": 130}, {"RNT": 57, "ANDL": 90, "PG": "M", "depth": 12, "ml-RNT": 57, "ml-ANDL": 75}, {"RNT": 47, "ANDL": 51, "PG": "M", "depth": 14, "ml-RNT": 47, "ml-ANDL": 40}, {"RNT": 39, "ANDL": 33, "PG": "M", "depth": 16, "ml-RNT": 39, "ml-ANDL": 24}, {"RNT": 34, "ANDL": 22, "PG": "M", "depth": 18, "ml-RNT": 34, "ml-ANDL": 13}, {"RNT": 30, "ANDL": 15, "PG": "M", "depth": 20, "ml-RNT": 30, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 10, "PG": "M", "depth": 22, "ml-RNT": 27, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 8, "PG": "M", "depth": 24, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 26, "ml-RNT": 21, "ml-ANDL": 3}, {"RNT": 20, "ANDL": 3, "PG": "M", "depth": 28}, {"RNT": 19, "ANDL": 0, "PG": "M", "depth": 30}, {"RNT": 17, "ANDL": 0, "PG": "M", "depth": 32}], 
// "N": [ {"RNT": 75, "ANDL": 144, "PG": "N", "depth": 10, "ml-RNT": 75, "ml-ANDL": 125}, {"RNT": 62, "ANDL": 85, "PG": "N", "depth": 12, "ml-RNT": 62, "ml-ANDL": 70}, {"RNT": 50, "ANDL": 48, "PG": "N", "depth": 14, "ml-RNT": 50, "ml-ANDL": 37}, {"RNT": 42, "ANDL": 30, "PG": "N", "depth": 16, "ml-RNT": 42, "ml-ANDL": 21}, {"RNT": 36, "ANDL": 20, "PG": "N", "depth": 18, "ml-RNT": 36, "ml-ANDL": 11}, {"RNT": 32, "ANDL": 13, "PG": "N", "depth": 20, "ml-RNT": 32, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 8, "PG": "N", "depth": 22, "ml-RNT": 29, "ml-ANDL": 4}, {"RNT": 25, "ANDL": 6, "PG": "N", "depth": 24, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 26, "ml-RNT": 23, "ml-ANDL": 0}, {"RNT": 21, "ANDL": 0, "PG": "N", "depth": 28, "ml-ANDL": 0}, {"RNT": 20, "ANDL": 0, "PG": "N", "depth": 30, "ml-ANDL": 0}], 
// "O": [ {"RNT": 82, "ANDL": 137, "PG": "O", "depth": 10, "ml-RNT": 82, "ml-ANDL": 118}, {"RNT": 66, "ANDL": 81, "PG": "O", "depth": 12, "ml-RNT": 66, "ml-ANDL": 66}, {"RNT": 53, "ANDL": 45, "PG": "O", "depth": 14, "ml-RNT": 53, "ml-ANDL": 34}, {"RNT": 45, "ANDL": 27, "PG": "O", "depth": 16, "ml-RNT": 45, "ml-ANDL": 18}, {"RNT": 39, "ANDL": 17, "PG": "O", "depth": 18, "ml-RNT": 39, "ml-ANDL": 8}, {"RNT": 34, "ANDL": 11, "PG": "O", "depth": 20, "ml-RNT": 34, "ml-ANDL": 6}, {"RNT": 30, "ANDL": 7, "PG": "O", "depth": 22, "ml-RNT": 30, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 5, "PG": "O", "depth": 24, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 26, "ml-RNT": 24, "ml-ANDL": 0}, {"RNT": 23, "ANDL": 0, "PG": "O", "depth": 28, "ml-ANDL": 0}], 
// "P": [ {"RNT": 88, "ANDL": 131, "PG": "P", "depth": 10, "ml-RNT": 88, "ml-ANDL": 112}, {"RNT": 71, "ANDL": 76, "PG": "P", "depth": 12, "ml-RNT": 71, "ml-ANDL": 61}, {"RNT": 57, "ANDL": 41, "PG": "P", "depth": 14, "ml-RNT": 57, "ml-ANDL": 30}, {"RNT": 48, "ANDL": 24, "PG": "P", "depth": 16, "ml-RNT": 48, "ml-ANDL": 15}, {"RNT": 41, "ANDL": 15, "PG": "P", "depth": 18, "ml-RNT": 41, "ml-ANDL": 6}, {"RNT": 36, "ANDL": 9, "PG": "P", "depth": 20, "ml-RNT": 36, "ml-ANDL": 4}, {"RNT": 32, "ANDL": 5, "PG": "P", "depth": 22, "ml-RNT": 32, "ml-ANDL": 0}, {"RNT": 28, "ANDL": 3, "PG": "P", "depth": 24, "ml-RNT": 28, "ml-ANDL": 0}, {"RNT": 27, "ANDL": 0, "PG": "P", "depth": 26, "ml-ANDL": 0}], 
// "Q": [ {"RNT": 95, "ANDL": 124, "PG": "Q", "depth": 10, "ml-RNT": 95, "ml-ANDL": 105}, {"RNT": 76, "ANDL": 71, "PG": "Q", "depth": 12, "ml-RNT": 76, "ml-ANDL": 56}, {"RNT": 61, "ANDL": 37, "PG": "Q", "depth": 14, "ml-RNT": 61, "ml-ANDL": 26}, {"RNT": 50, "ANDL": 22, "PG": "Q", "depth": 16, "ml-RNT": 50, "ml-ANDL": 13}, {"RNT": 43, "ANDL": 13, "PG": "Q", "depth": 18, "ml-RNT": 43, "ml-ANDL": 4}, {"RNT": 38, "ANDL": 7, "PG": "Q", "depth": 20, "ml-RNT": 38, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 3, "PG": "Q", "depth": 22, "ml-RNT": 33, "ml-ANDL": 0}, {"RNT": 29, "ANDL": 2, "PG": "Q", "depth": 24, "ml-ANDL": 0}], 
// "R": [ {"RNT": 104, "ANDL": 115, "PG": "R", "depth": 10, "ml-RNT": 104, "ml-ANDL": 96}, {"RNT": 82, "ANDL": 65, "PG": "R", "depth": 12, "ml-RNT": 82, "ml-ANDL": 50}, {"RNT": 64, "ANDL": 34, "PG": "R", "depth": 14, "ml-RNT": 64, "ml-ANDL": 23}, {"RNT": 53, "ANDL": 19, "PG": "R", "depth": 16, "ml-RNT": 53, "ml-ANDL": 10}, {"RNT": 46, "ANDL": 10, "PG": "R", "depth": 18, "ml-RNT": 47, "ml-ANDL": 0}, {"RNT": 40, "ANDL": 5, "PG": "R", "depth": 20, "ml-RNT": 40, "ml-ANDL": 0}, {"RNT": 36, "ANDL": 0, "PG": "R", "depth": 22, "ml-ANDL": 0}, {"RNT": 31, "ANDL": 0, "PG": "R", "depth": 24, "ml-ANDL": 0}], 
// "S": [ {"RNT": 112, "ANDL": 107, "PG": "S", "depth": 10, "ml-RNT": 112, "ml-ANDL": 88}, {"RNT": 88, "ANDL": 59, "PG": "S", "depth": 12, "ml-RNT": 88, "ml-ANDL": 44}, {"RNT": 68, "ANDL": 30, "PG": "S", "depth": 14, "ml-RNT": 68, "ml-ANDL": 19}, {"RNT": 56, "ANDL": 16, "PG": "S", "depth": 16, "ml-RNT": 56, "ml-ANDL": 7}, {"RNT": 48, "ANDL": 8, "PG": "S", "depth": 18, "ml-ANDL": 0}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 20, "ml-ANDL": 0}, {"RNT": 37, "ANDL": 0, "PG": "S", "depth": 22, "ml-ANDL": 0}], 
// "T": [ {"RNT": 122, "ANDL": 97, "PG": "T", "depth": 10, "ml-RNT": 122, "ml-ANDL": 78}, {"RNT": 94, "ANDL": 53, "PG": "T", "depth": 12, "ml-RNT": 94, "ml-ANDL": 38}, {"RNT": 73, "ANDL": 25, "PG": "T", "depth": 14, "ml-RNT": 73, "ml-ANDL": 14}, {"RNT": 60, "ANDL": 12, "PG": "T", "depth": 16, "ml-RNT": 60, "ml-ANDL": 3}, {"RNT": 51, "ANDL": 5, "PG": "T", "depth": 18, "ml-ANDL": 0}, {"RNT": 44, "ANDL": 0, "PG": "T", "depth": 20, "ml-ANDL": 0}], 
// "U": [ {"RNT": 133, "ANDL": 86, "PG": "U", "depth": 10, "ml-RNT": 133, "ml-ANDL": 67}, {"RNT": 101, "ANDL": 46, "PG": "U", "depth": 12, "ml-RNT": 101, "ml-ANDL": 31}, {"RNT": 77, "ANDL": 21, "PG": "U", "depth": 14, "ml-RNT": 77, "ml-ANDL": 10}, {"RNT": 63, "ANDL": 9, "PG": "U", "depth": 16, "ml-RNT": 63, "ml-ANDL": 0}, {"RNT": 53, "ANDL": 3, "PG": "U", "depth": 18, "ml-ANDL": 0}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 20, "ml-ANDL": 0}], 
// "V": [ {"RNT": 145, "ANDL": 74, "PG": "V", "depth": 10, "ml-RNT": 145, "ml-ANDL": 55}, {"RNT": 108, "ANDL": 39, "PG": "V", "depth": 12, "ml-RNT": 108, "ml-ANDL": 24}, {"RNT": 82, "ANDL": 16, "PG": "V", "depth": 14, "ml-RNT": 82, "ml-ANDL": 5}, {"RNT": 67, "ANDL": 5, "PG": "V", "depth": 16, "ml-ANDL": 0}, {"RNT": 55, "ANDL": 0, "PG": "V", "depth": 18, "ml-ANDL": 0}], 
// "W": [ {"RNT": 160, "ANDL": 59, "PG": "W", "depth": 10, "ml-RNT": 160, "ml-ANDL": 40}, {"RNT": 116, "ANDL": 31, "PG": "W", "depth": 12, "ml-RNT": 116, "ml-ANDL": 16}, {"RNT": 87, "ANDL": 11, "PG": "W", "depth": 14, "ml-RNT": 87, "ml-ANDL": 0}, {"RNT": 70, "ANDL": 2, "PG": "W", "depth": 16, "ml-ANDL": 0}, {"RNT": 56, "ANDL": 0, "PG": "W", "depth": 18, "ml-ANDL": 0}], 
// "X": [ {"RNT": 178, "ANDL": 41, "PG": "X", "depth": 10, "ml-RNT": 178, "ml-ANDL": 22}, {"RNT": 125, "ANDL": 22, "PG": "X", "depth": 12, "ml-RNT": 125, "ml-ANDL": 7}, {"RNT": 92, "ANDL": 6, "PG": "X", "depth": 14, "ml-ANDL": 0}, {"RNT": 72, "ANDL": 0, "PG": "X", "depth": 16, "ml-ANDL": 0}], 
// "Y": [ {"RNT": 199, "ANDL": 20, "PG": "Y", "depth": 10, "ml-RNT": 199, "ml-ANDL": 0}, {"RNT": 134, "ANDL": 13, "PG": "Y", "depth": 12, "ml-RNT": 132, "ml-ANDL": 0}, {"RNT": 98, "ANDL": 0, "PG": "Y", "depth": 14, "ml-ANDL": 0}], 
// "Z": [ {"RNT": 219, "ANDL": 0, "PG": "Z", "depth": 10, "ml-RNT": 200, "ml-ANDL": 0}, {"RNT": 147, "ANDL": 0, "PG": "Z", "depth": 12, "ml-ANDL": 0}]}
 
RDTableM = //[LMNT 20141208]: Auto populated table created with new engine
{
"A": [ {"RNT": 10, "ANDL": 209, "PG": "A", "depth": 10, "ml-RNT": 10, "ml-ANDL": 190}, {"RNT": 9, "ANDL": 138, "PG": "A", "depth": 12, "ml-RNT": 9, "ml-ANDL": 123}, {"RNT": 8, "ANDL": 90, "PG": "A", "depth": 14, "ml-RNT": 8, "ml-ANDL": 79}, {"RNT": 7, "ANDL": 65, "PG": "A", "depth": 16, "ml-RNT": 7, "ml-ANDL": 56}, {"RNT": 6, "ANDL": 50, "PG": "A", "depth": 18, "ml-RNT": 6, "ml-ANDL": 41}, {"RNT": 6, "ANDL": 39, "PG": "A", "depth": 20, "ml-RNT": 6, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 32, "PG": "A", "depth": 22, "ml-RNT": 5, "ml-ANDL": 28}, {"RNT": 4, "ANDL": 27, "PG": "A", "depth": 24, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 26, "ml-RNT": 4, "ml-ANDL": 20}, {"RNT": 3, "ANDL": 20, "PG": "A", "depth": 28, "ml-RNT": 3, "ml-ANDL": 20}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 30, "ml-RNT": 3, "ml-ANDL": 17}, {"RNT": 3, "ANDL": 14, "PG": "A", "depth": 32, "ml-RNT": 3, "ml-ANDL": 14}, {"RNT": 3, "ANDL": 12, "PG": "A", "depth": 34, "ml-RNT": 3, "ml-ANDL": 12}, {"RNT": 2, "ANDL": 11, "PG": "A", "depth": 36, "ml-RNT": 2, "ml-ANDL": 11}, {"RNT": 2, "ANDL": 9, "PG": "A", "depth": 38, "ml-RNT": 2, "ml-ANDL": 9}, {"RNT": 2, "ANDL": 7, "PG": "A", "depth": 40, "ml-RNT": 2, "ml-ANDL": 7}],
"B": [ {"RNT": 20, "ANDL": 199, "PG": "B", "depth": 10, "ml-RNT": 20, "ml-ANDL": 180}, {"RNT": 17, "ANDL": 130, "PG": "B", "depth": 12, "ml-RNT": 17, "ml-ANDL": 115}, {"RNT": 15, "ANDL": 83, "PG": "B", "depth": 14, "ml-RNT": 15, "ml-ANDL": 72}, {"RNT": 13, "ANDL": 59, "PG": "B", "depth": 16, "ml-RNT": 13, "ml-ANDL": 50}, {"RNT": 11, "ANDL": 45, "PG": "B", "depth": 18, "ml-RNT": 11, "ml-ANDL": 36}, {"RNT": 10, "ANDL": 35, "PG": "B", "depth": 20, "ml-RNT": 10, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 28, "PG": "B", "depth": 22, "ml-RNT": 9, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 23, "PG": "B", "depth": 24, "ml-RNT": 8, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 26, "ml-RNT": 7, "ml-ANDL": 17}, {"RNT": 6, "ANDL": 17, "PG": "B", "depth": 28, "ml-RNT": 6, "ml-ANDL": 17}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 30, "ml-RNT": 6, "ml-ANDL": 14}, {"RNT": 5, "ANDL": 12, "PG": "B", "depth": 32, "ml-RNT": 5, "ml-ANDL": 12}, {"RNT": 5, "ANDL": 10, "PG": "B", "depth": 34, "ml-RNT": 5, "ml-ANDL": 10}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 36, "ml-RNT": 5, "ml-ANDL": 8}, {"RNT": 5, "ANDL": 6, "PG": "B", "depth": 38, "ml-RNT": 5, "ml-ANDL": 6}, {"RNT": 5, "ANDL": 4, "PG": "B", "depth": 40, "ml-RNT": 5, "ml-ANDL": 4}],
"C": [ {"RNT": 26, "ANDL": 193, "PG": "C", "depth": 10, "ml-RNT": 26, "ml-ANDL": 174}, {"RNT": 23, "ANDL": 124, "PG": "C", "depth": 12, "ml-RNT": 23, "ml-ANDL": 109}, {"RNT": 19, "ANDL": 79, "PG": "C", "depth": 14, "ml-RNT": 19, "ml-ANDL": 68}, {"RNT": 17, "ANDL": 55, "PG": "C", "depth": 16, "ml-RNT": 17, "ml-ANDL": 46}, {"RNT": 15, "ANDL": 41, "PG": "C", "depth": 18, "ml-RNT": 15, "ml-ANDL": 32}, {"RNT": 13, "ANDL": 32, "PG": "C", "depth": 20, "ml-RNT": 13, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 25, "PG": "C", "depth": 22, "ml-RNT": 12, "ml-ANDL": 21}, {"RNT": 10, "ANDL": 21, "PG": "C", "depth": 24, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 18, "PG": "C", "depth": 26, "ml-RNT": 9, "ml-ANDL": 15}, {"RNT": 8, "ANDL": 15, "PG": "C", "depth": 28, "ml-RNT": 8, "ml-ANDL": 15}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 30, "ml-RNT": 8, "ml-ANDL": 12}, {"RNT": 7, "ANDL": 10, "PG": "C", "depth": 32, "ml-RNT": 7, "ml-ANDL": 10}, {"RNT": 7, "ANDL": 8, "PG": "C", "depth": 34, "ml-RNT": 7, "ml-ANDL": 8}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 36, "ml-RNT": 6, "ml-ANDL": 7}, {"RNT": 6, "ANDL": 5, "PG": "C", "depth": 38, "ml-RNT": 6, "ml-ANDL": 5}, {"RNT": 6, "ANDL": 3, "PG": "C", "depth": 40, "ml-RNT": 6, "ml-ANDL": 3}],
"D": [ {"RNT": 30, "ANDL": 189, "PG": "D", "depth": 10, "ml-RNT": 30, "ml-ANDL": 170}, {"RNT": 26, "ANDL": 121, "PG": "D", "depth": 12, "ml-RNT": 26, "ml-ANDL": 106}, {"RNT": 22, "ANDL": 76, "PG": "D", "depth": 14, "ml-RNT": 22, "ml-ANDL": 65}, {"RNT": 19, "ANDL": 53, "PG": "D", "depth": 16, "ml-RNT": 19, "ml-ANDL": 43}, {"RNT": 16, "ANDL": 40, "PG": "D", "depth": 18, "ml-RNT": 16, "ml-ANDL": 31}, {"RNT": 15, "ANDL": 30, "PG": "D", "depth": 20, "ml-RNT": 15, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 24, "PG": "D", "depth": 22, "ml-RNT": 13, "ml-ANDL": 20}, {"RNT": 11, "ANDL": 20, "PG": "D", "depth": 24, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 26, "ml-RNT": 10, "ml-ANDL": 14}, {"RNT": 9, "ANDL": 14, "PG": "D", "depth": 28, "ml-RNT": 9, "ml-ANDL": 14}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 30, "ml-RNT": 9, "ml-ANDL": 11}, {"RNT": 8, "ANDL": 9, "PG": "D", "depth": 32, "ml-RNT": 8, "ml-ANDL": 9}, {"RNT": 8, "ANDL": 7, "PG": "D", "depth": 34, "ml-RNT": 8, "ml-ANDL": 7}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 36, "ml-RNT": 7, "ml-ANDL": 6}, {"RNT": 7, "ANDL": 4, "PG": "D", "depth": 38, "ml-RNT": 7, "ml-ANDL": 4}, {"RNT": 7, "ANDL": 0, "PG": "D", "depth": 40, "ml-RNT": 7, "ml-ANDL": 0}],
"E": [ {"RNT": 34, "ANDL": 185, "PG": "E", "depth": 10, "ml-RNT": 34, "ml-ANDL": 166}, {"RNT": 29, "ANDL": 118, "PG": "E", "depth": 12, "ml-RNT": 29, "ml-ANDL": 103}, {"RNT": 24, "ANDL": 74, "PG": "E", "depth": 14, "ml-RNT": 24, "ml-ANDL": 63}, {"RNT": 21, "ANDL": 51, "PG": "E", "depth": 16, "ml-RNT": 21, "ml-ANDL": 42}, {"RNT": 18, "ANDL": 38, "PG": "E", "depth": 18, "ml-RNT": 18, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 20, "ml-RNT": 16, "ml-ANDL": 24}, {"RNT": 15, "ANDL": 22, "PG": "E", "depth": 22, "ml-RNT": 15, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 18, "PG": "E", "depth": 24, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 11, "ANDL": 16, "PG": "E", "depth": 26, "ml-RNT": 11, "ml-ANDL": 13}, {"RNT": 11, "ANDL": 12, "PG": "E", "depth": 28, "ml-RNT": 11, "ml-ANDL": 12}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 30, "ml-RNT": 10, "ml-ANDL": 10}, {"RNT": 9, "ANDL": 8, "PG": "E", "depth": 32, "ml-RNT": 9, "ml-ANDL": 8}, {"RNT": 8, "ANDL": 7, "PG": "E", "depth": 34, "ml-RNT": 8, "ml-ANDL": 7}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 36, "ml-RNT": 8, "ml-ANDL": 5}, {"RNT": 8, "ANDL": 3, "PG": "E", "depth": 38, "ml-RNT": 8, "ml-ANDL": 3}, {"RNT": 7, "ANDL": 0, "PG": "E", "depth": 40, "ml-RNT": 7, "ml-ANDL": 0}],
"F": [ {"RNT": 37, "ANDL": 182, "PG": "F", "depth": 10, "ml-RNT": 37, "ml-ANDL": 163}, {"RNT": 32, "ANDL": 115, "PG": "F", "depth": 12, "ml-RNT": 32, "ml-ANDL": 100}, {"RNT": 27, "ANDL": 71, "PG": "F", "depth": 14, "ml-RNT": 27, "ml-ANDL": 60}, {"RNT": 23, "ANDL": 49, "PG": "F", "depth": 16, "ml-RNT": 23, "ml-ANDL": 40}, {"RNT": 20, "ANDL": 36, "PG": "F", "depth": 18, "ml-RNT": 20, "ml-ANDL": 27}, {"RNT": 18, "ANDL": 27, "PG": "F", "depth": 20, "ml-RNT": 18, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 21, "PG": "F", "depth": 22, "ml-RNT": 16, "ml-ANDL": 17}, {"RNT": 14, "ANDL": 17, "PG": "F", "depth": 24, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 26, "ml-RNT": 13, "ml-ANDL": 11}, {"RNT": 12, "ANDL": 11, "PG": "F", "depth": 28, "ml-RNT": 12, "ml-ANDL": 11}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 30, "ml-RNT": 11, "ml-ANDL": 9}, {"RNT": 10, "ANDL": 7, "PG": "F", "depth": 32, "ml-RNT": 10, "ml-ANDL": 7}, {"RNT": 9, "ANDL": 6, "PG": "F", "depth": 34, "ml-RNT": 9, "ml-ANDL": 6}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 36, "ml-RNT": 9, "ml-ANDL": 4}, {"RNT": 9, "ANDL": 0, "PG": "F", "depth": 38, "ml-RNT": 9, "ml-ANDL": 0}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 40, "ml-RNT": 8, "ml-ANDL": 0}],
"G": [ {"RNT": 41, "ANDL": 178, "PG": "G", "depth": 10, "ml-RNT": 41, "ml-ANDL": 159}, {"RNT": 35, "ANDL": 112, "PG": "G", "depth": 12, "ml-RNT": 36, "ml-ANDL": 96}, {"RNT": 29, "ANDL": 69, "PG": "G", "depth": 14, "ml-RNT": 29, "ml-ANDL": 58}, {"RNT": 25, "ANDL": 47, "PG": "G", "depth": 16, "ml-RNT": 25, "ml-ANDL": 38}, {"RNT": 22, "ANDL": 34, "PG": "G", "depth": 18, "ml-RNT": 22, "ml-ANDL": 25}, {"RNT": 20, "ANDL": 25, "PG": "G", "depth": 20, "ml-RNT": 20, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 19, "PG": "G", "depth": 22, "ml-RNT": 18, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 16, "PG": "G", "depth": 24, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 26, "ml-RNT": 14, "ml-ANDL": 10}, {"RNT": 13, "ANDL": 10, "PG": "G", "depth": 28, "ml-RNT": 13, "ml-ANDL": 10}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 30, "ml-RNT": 12, "ml-ANDL": 8}, {"RNT": 11, "ANDL": 6, "PG": "G", "depth": 32, "ml-RNT": 11, "ml-ANDL": 6}, {"RNT": 10, "ANDL": 5, "PG": "G", "depth": 34, "ml-RNT": 10, "ml-ANDL": 5}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 36, "ml-RNT": 10, "ml-ANDL": 3}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 38, "ml-RNT": 9, "ml-ANDL": 0}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 40, "ml-RNT": 9, "ml-ANDL": 0}],
"H": [ {"RNT": 45, "ANDL": 174, "PG": "H", "depth": 10, "ml-RNT": 45, "ml-ANDL": 155}, {"RNT": 38, "ANDL": 109, "PG": "H", "depth": 12, "ml-RNT": 38, "ml-ANDL": 94}, {"RNT": 32, "ANDL": 66, "PG": "H", "depth": 14, "ml-RNT": 32, "ml-ANDL": 55}, {"RNT": 27, "ANDL": 45, "PG": "H", "depth": 16, "ml-RNT": 27, "ml-ANDL": 36}, {"RNT": 24, "ANDL": 32, "PG": "H", "depth": 18, "ml-RNT": 24, "ml-ANDL": 23}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 20, "ml-RNT": 21, "ml-ANDL": 19}, {"RNT": 19, "ANDL": 18, "PG": "H", "depth": 22, "ml-RNT": 19, "ml-ANDL": 14}, {"RNT": 16, "ANDL": 15, "PG": "H", "depth": 24, "ml-RNT": 16, "ml-ANDL": 12}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 26, "ml-RNT": 15, "ml-ANDL": 9}, {"RNT": 14, "ANDL": 9, "PG": "H", "depth": 28, "ml-RNT": 14, "ml-ANDL": 9}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 30, "ml-RNT": 13, "ml-ANDL": 7}, {"RNT": 12, "ANDL": 5, "PG": "H", "depth": 32, "ml-RNT": 12, "ml-ANDL": 5}, {"RNT": 11, "ANDL": 4, "PG": "H", "depth": 34, "ml-RNT": 11, "ml-ANDL": 4}, {"RNT": 10, "ANDL": 3, "PG": "H", "depth": 36, "ml-RNT": 10, "ml-ANDL": 3}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 38, "ml-RNT": 10, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "H", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"I": [ {"RNT": 50, "ANDL": 169, "PG": "I", "depth": 10, "ml-RNT": 50, "ml-ANDL": 150}, {"RNT": 42, "ANDL": 105, "PG": "I", "depth": 12, "ml-RNT": 42, "ml-ANDL": 90}, {"RNT": 35, "ANDL": 63, "PG": "I", "depth": 14, "ml-RNT": 35, "ml-ANDL": 52}, {"RNT": 29, "ANDL": 43, "PG": "I", "depth": 16, "ml-RNT": 29, "ml-ANDL": 34}, {"RNT": 26, "ANDL": 30, "PG": "I", "depth": 18, "ml-RNT": 26, "ml-ANDL": 21}, {"RNT": 23, "ANDL": 22, "PG": "I", "depth": 20, "ml-RNT": 23, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 16, "PG": "I", "depth": 22, "ml-RNT": 21, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 13, "PG": "I", "depth": 24, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 26, "ml-RNT": 16, "ml-ANDL": 8}, {"RNT": 15, "ANDL": 8, "PG": "I", "depth": 28, "ml-RNT": 15, "ml-ANDL": 8}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 30, "ml-RNT": 14, "ml-ANDL": 6}, {"RNT": 13, "ANDL": 4, "PG": "I", "depth": 32, "ml-RNT": 13, "ml-ANDL": 4}, {"RNT": 12, "ANDL": 3, "PG": "I", "depth": 34, "ml-RNT": 12, "ml-ANDL": 3}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 36, "ml-RNT": 11, "ml-ANDL": 0}, {"RNT": 11, "ANDL": 0, "PG": "I", "depth": 38, "ml-RNT": 11, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "I", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"J": [ {"RNT": 54, "ANDL": 165, "PG": "J", "depth": 10, "ml-RNT": 54, "ml-ANDL": 146}, {"RNT": 45, "ANDL": 102, "PG": "J", "depth": 12, "ml-RNT": 45, "ml-ANDL": 87}, {"RNT": 37, "ANDL": 61, "PG": "J", "depth": 14, "ml-RNT": 37, "ml-ANDL": 50}, {"RNT": 32, "ANDL": 40, "PG": "J", "depth": 16, "ml-RNT": 32, "ml-ANDL": 31}, {"RNT": 28, "ANDL": 28, "PG": "J", "depth": 18, "ml-RNT": 28, "ml-ANDL": 19}, {"RNT": 25, "ANDL": 20, "PG": "J", "depth": 20, "ml-RNT": 25, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 15, "PG": "J", "depth": 22, "ml-RNT": 22, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 12, "PG": "J", "depth": 24, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 17, "ANDL": 10, "PG": "J", "depth": 26, "ml-RNT": 17, "ml-ANDL": 7}, {"RNT": 16, "ANDL": 7, "PG": "J", "depth": 28, "ml-RNT": 16, "ml-ANDL": 7}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 30, "ml-RNT": 15, "ml-ANDL": 5}, {"RNT": 14, "ANDL": 3, "PG": "J", "depth": 32, "ml-RNT": 14, "ml-ANDL": 3}, {"RNT": 13, "ANDL": 0, "PG": "J", "depth": 34, "ml-RNT": 13, "ml-ANDL": 0}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 36, "ml-RNT": 12, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "J", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "J", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"K": [ {"RNT": 59, "ANDL": 160, "PG": "K", "depth": 10, "ml-RNT": 59, "ml-ANDL": 141}, {"RNT": 49, "ANDL": 98, "PG": "K", "depth": 12, "ml-RNT": 49, "ml-ANDL": 83}, {"RNT": 40, "ANDL": 58, "PG": "K", "depth": 14, "ml-RNT": 40, "ml-ANDL": 47}, {"RNT": 34, "ANDL": 38, "PG": "K", "depth": 16, "ml-RNT": 34, "ml-ANDL": 29}, {"RNT": 30, "ANDL": 26, "PG": "K", "depth": 18, "ml-RNT": 30, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 20, "ml-RNT": 26, "ml-ANDL": 14}, {"RNT": 24, "ANDL": 13, "PG": "K", "depth": 22, "ml-RNT": 24, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 10, "PG": "K", "depth": 24, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 26, "ml-RNT": 19, "ml-ANDL": 5}, {"RNT": 17, "ANDL": 6, "PG": "K", "depth": 28, "ml-RNT": 17, "ml-ANDL": 6}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 30, "ml-RNT": 16, "ml-ANDL": 4}, {"RNT": 15, "ANDL": 0, "PG": "K", "depth": 32, "ml-RNT": 15, "ml-ANDL": 0}, {"RNT": 14, "ANDL": 0, "PG": "K", "depth": 34, "ml-RNT": 14, "ml-ANDL": 0}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 36, "ml-RNT": 13, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "K", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "K", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"L": [ {"RNT": 64, "ANDL": 155, "PG": "L", "depth": 10, "ml-RNT": 64, "ml-ANDL": 136}, {"RNT": 53, "ANDL": 94, "PG": "L", "depth": 12, "ml-RNT": 53, "ml-ANDL": 79}, {"RNT": 43, "ANDL": 55, "PG": "L", "depth": 14, "ml-RNT": 43, "ml-ANDL": 44}, {"RNT": 37, "ANDL": 35, "PG": "L", "depth": 16, "ml-RNT": 37, "ml-ANDL": 26}, {"RNT": 32, "ANDL": 24, "PG": "L", "depth": 18, "ml-RNT": 32, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 20, "ml-RNT": 28, "ml-ANDL": 12}, {"RNT": 25, "ANDL": 12, "PG": "L", "depth": 22, "ml-RNT": 25, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 9, "PG": "L", "depth": 24, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 26, "ml-RNT": 20, "ml-ANDL": 4}, {"RNT": 18, "ANDL": 5, "PG": "L", "depth": 28, "ml-RNT": 18, "ml-ANDL": 5}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 30, "ml-RNT": 17, "ml-ANDL": 3}, {"RNT": 16, "ANDL": 0, "PG": "L", "depth": 32, "ml-RNT": 16, "ml-ANDL": 0}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 34, "ml-RNT": 15, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "L", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "L", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "L", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"M": [ {"RNT": 70, "ANDL": 149, "PG": "M", "depth": 10, "ml-RNT": 70, "ml-ANDL": 130}, {"RNT": 57, "ANDL": 90, "PG": "M", "depth": 12, "ml-RNT": 57, "ml-ANDL": 75}, {"RNT": 47, "ANDL": 51, "PG": "M", "depth": 14, "ml-RNT": 47, "ml-ANDL": 40}, {"RNT": 39, "ANDL": 33, "PG": "M", "depth": 16, "ml-RNT": 39, "ml-ANDL": 24}, {"RNT": 34, "ANDL": 22, "PG": "M", "depth": 18, "ml-RNT": 34, "ml-ANDL": 13}, {"RNT": 30, "ANDL": 15, "PG": "M", "depth": 20, "ml-RNT": 30, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 10, "PG": "M", "depth": 22, "ml-RNT": 27, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 8, "PG": "M", "depth": 24, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 26, "ml-RNT": 21, "ml-ANDL": 3}, {"RNT": 20, "ANDL": 3, "PG": "M", "depth": 28, "ml-RNT": 20, "ml-ANDL": 3}, {"RNT": 19, "ANDL": 0, "PG": "M", "depth": 30, "ml-RNT": 19, "ml-ANDL": 0}, {"RNT": 17, "ANDL": 0, "PG": "M", "depth": 32, "ml-RNT": 17, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"N": [ {"RNT": 75, "ANDL": 144, "PG": "N", "depth": 10, "ml-RNT": 75, "ml-ANDL": 125}, {"RNT": 62, "ANDL": 85, "PG": "N", "depth": 12, "ml-RNT": 62, "ml-ANDL": 70}, {"RNT": 50, "ANDL": 48, "PG": "N", "depth": 14, "ml-RNT": 50, "ml-ANDL": 37}, {"RNT": 42, "ANDL": 30, "PG": "N", "depth": 16, "ml-RNT": 42, "ml-ANDL": 21}, {"RNT": 36, "ANDL": 20, "PG": "N", "depth": 18, "ml-RNT": 36, "ml-ANDL": 11}, {"RNT": 32, "ANDL": 13, "PG": "N", "depth": 20, "ml-RNT": 32, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 8, "PG": "N", "depth": 22, "ml-RNT": 29, "ml-ANDL": 4}, {"RNT": 25, "ANDL": 6, "PG": "N", "depth": 24, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 26, "ml-RNT": 23, "ml-ANDL": 0}, {"RNT": 21, "ANDL": 0, "PG": "N", "depth": 28, "ml-RNT": 21, "ml-ANDL": 0}, {"RNT": 20, "ANDL": 0, "PG": "N", "depth": 30, "ml-RNT": 20, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"O": [ {"RNT": 82, "ANDL": 137, "PG": "O", "depth": 10, "ml-RNT": 82, "ml-ANDL": 118}, {"RNT": 66, "ANDL": 81, "PG": "O", "depth": 12, "ml-RNT": 66, "ml-ANDL": 66}, {"RNT": 53, "ANDL": 45, "PG": "O", "depth": 14, "ml-RNT": 53, "ml-ANDL": 34}, {"RNT": 45, "ANDL": 27, "PG": "O", "depth": 16, "ml-RNT": 45, "ml-ANDL": 18}, {"RNT": 39, "ANDL": 17, "PG": "O", "depth": 18, "ml-RNT": 39, "ml-ANDL": 8}, {"RNT": 34, "ANDL": 11, "PG": "O", "depth": 20, "ml-RNT": 34, "ml-ANDL": 6}, {"RNT": 30, "ANDL": 7, "PG": "O", "depth": 22, "ml-RNT": 30, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 5, "PG": "O", "depth": 24, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 26, "ml-RNT": 24, "ml-ANDL": 0}, {"RNT": 23, "ANDL": 0, "PG": "O", "depth": 28, "ml-RNT": 23, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"P": [ {"RNT": 88, "ANDL": 131, "PG": "P", "depth": 10, "ml-RNT": 88, "ml-ANDL": 112}, {"RNT": 71, "ANDL": 76, "PG": "P", "depth": 12, "ml-RNT": 71, "ml-ANDL": 61}, {"RNT": 57, "ANDL": 41, "PG": "P", "depth": 14, "ml-RNT": 57, "ml-ANDL": 30}, {"RNT": 48, "ANDL": 24, "PG": "P", "depth": 16, "ml-RNT": 48, "ml-ANDL": 15}, {"RNT": 41, "ANDL": 15, "PG": "P", "depth": 18, "ml-RNT": 41, "ml-ANDL": 6}, {"RNT": 36, "ANDL": 9, "PG": "P", "depth": 20, "ml-RNT": 36, "ml-ANDL": 4}, {"RNT": 32, "ANDL": 5, "PG": "P", "depth": 22, "ml-RNT": 32, "ml-ANDL": 0}, {"RNT": 28, "ANDL": 3, "PG": "P", "depth": 24, "ml-RNT": 28, "ml-ANDL": 0}, {"RNT": 27, "ANDL": 0, "PG": "P", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"Q": [ {"RNT": 95, "ANDL": 124, "PG": "Q", "depth": 10, "ml-RNT": 95, "ml-ANDL": 105}, {"RNT": 76, "ANDL": 71, "PG": "Q", "depth": 12, "ml-RNT": 76, "ml-ANDL": 56}, {"RNT": 61, "ANDL": 37, "PG": "Q", "depth": 14, "ml-RNT": 61, "ml-ANDL": 26}, {"RNT": 50, "ANDL": 22, "PG": "Q", "depth": 16, "ml-RNT": 50, "ml-ANDL": 13}, {"RNT": 43, "ANDL": 13, "PG": "Q", "depth": 18, "ml-RNT": 43, "ml-ANDL": 4}, {"RNT": 38, "ANDL": 7, "PG": "Q", "depth": 20, "ml-RNT": 38, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 3, "PG": "Q", "depth": 22, "ml-RNT": 33, "ml-ANDL": 0}, {"RNT": 29, "ANDL": 2, "PG": "Q", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"R": [ {"RNT": 104, "ANDL": 115, "PG": "R", "depth": 10, "ml-RNT": 104, "ml-ANDL": 96}, {"RNT": 82, "ANDL": 65, "PG": "R", "depth": 12, "ml-RNT": 82, "ml-ANDL": 50}, {"RNT": 64, "ANDL": 34, "PG": "R", "depth": 14, "ml-RNT": 64, "ml-ANDL": 23}, {"RNT": 53, "ANDL": 19, "PG": "R", "depth": 16, "ml-RNT": 53, "ml-ANDL": 10}, {"RNT": 46, "ANDL": 10, "PG": "R", "depth": 18, "ml-RNT": 47, "ml-ANDL": 0}, {"RNT": 40, "ANDL": 5, "PG": "R", "depth": 20, "ml-RNT": 40, "ml-ANDL": 0}, {"RNT": 36, "ANDL": 0, "PG": "R", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 31, "ANDL": 0, "PG": "R", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"S": [ {"RNT": 112, "ANDL": 107, "PG": "S", "depth": 10, "ml-RNT": 112, "ml-ANDL": 88}, {"RNT": 88, "ANDL": 59, "PG": "S", "depth": 12, "ml-RNT": 88, "ml-ANDL": 44}, {"RNT": 68, "ANDL": 30, "PG": "S", "depth": 14, "ml-RNT": 68, "ml-ANDL": 19}, {"RNT": 56, "ANDL": 16, "PG": "S", "depth": 16, "ml-RNT": 56, "ml-ANDL": 7}, {"RNT": 48, "ANDL": 8, "PG": "S", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 37, "ANDL": 0, "PG": "S", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"T": [ {"RNT": 122, "ANDL": 97, "PG": "T", "depth": 10, "ml-RNT": 122, "ml-ANDL": 78}, {"RNT": 94, "ANDL": 53, "PG": "T", "depth": 12, "ml-RNT": 94, "ml-ANDL": 38}, {"RNT": 73, "ANDL": 25, "PG": "T", "depth": 14, "ml-RNT": 73, "ml-ANDL": 14}, {"RNT": 60, "ANDL": 12, "PG": "T", "depth": 16, "ml-RNT": 60, "ml-ANDL": 3}, {"RNT": 51, "ANDL": 5, "PG": "T", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 44, "ANDL": 0, "PG": "T", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"U": [ {"RNT": 133, "ANDL": 86, "PG": "U", "depth": 10, "ml-RNT": 133, "ml-ANDL": 67}, {"RNT": 101, "ANDL": 46, "PG": "U", "depth": 12, "ml-RNT": 101, "ml-ANDL": 31}, {"RNT": 77, "ANDL": 21, "PG": "U", "depth": 14, "ml-RNT": 77, "ml-ANDL": 10}, {"RNT": 63, "ANDL": 9, "PG": "U", "depth": 16, "ml-RNT": 63, "ml-ANDL": 0}, {"RNT": 53, "ANDL": 3, "PG": "U", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"V": [ {"RNT": 145, "ANDL": 74, "PG": "V", "depth": 10, "ml-RNT": 145, "ml-ANDL": 55}, {"RNT": 108, "ANDL": 39, "PG": "V", "depth": 12, "ml-RNT": 108, "ml-ANDL": 24}, {"RNT": 82, "ANDL": 16, "PG": "V", "depth": 14, "ml-RNT": 82, "ml-ANDL": 5}, {"RNT": 67, "ANDL": 5, "PG": "V", "depth": 16, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 55, "ANDL": 0, "PG": "V", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"W": [ {"RNT": 160, "ANDL": 59, "PG": "W", "depth": 10, "ml-RNT": 160, "ml-ANDL": 40}, {"RNT": 116, "ANDL": 31, "PG": "W", "depth": 12, "ml-RNT": 116, "ml-ANDL": 16}, {"RNT": 87, "ANDL": 11, "PG": "W", "depth": 14, "ml-RNT": 87, "ml-ANDL": 0}, {"RNT": 70, "ANDL": 2, "PG": "W", "depth": 16, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 56, "ANDL": 0, "PG": "W", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"X": [ {"RNT": 178, "ANDL": 41, "PG": "X", "depth": 10, "ml-RNT": 178, "ml-ANDL": 22}, {"RNT": 125, "ANDL": 22, "PG": "X", "depth": 12, "ml-RNT": 125, "ml-ANDL": 7}, {"RNT": 92, "ANDL": 6, "PG": "X", "depth": 14, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 72, "ANDL": 0, "PG": "X", "depth": 16, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"Y": [ {"RNT": 199, "ANDL": 20, "PG": "Y", "depth": 10, "ml-RNT": 199, "ml-ANDL": 0}, {"RNT": 134, "ANDL": 13, "PG": "Y", "depth": 12, "ml-RNT": 132, "ml-ANDL": 0}, {"RNT": 98, "ANDL": 0, "PG": "Y", "depth": 14, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 16, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}],
"Z": [ {"RNT": 219, "ANDL": 0, "PG": "Z", "depth": 10, "ml-RNT": 200, "ml-ANDL": 0}, {"RNT": 147, "ANDL": 0, "PG": "Z", "depth": 12, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 14, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 16, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 18, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 20, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 22, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 24, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 26, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 28, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 30, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 32, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 34, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 36, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 38, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}]}

 
// RDTableFT = // Original Table
// {
// "A": [{"RNT": 10, "ANDL": 195, "PG": "A", "depth": 35, "ml-RNT": 10, "ml-ANDL": 180}, {"RNT": 9, "ANDL": 131, "PG": "A", "depth": 40, "ml-RNT": 9, "ml-ANDL": 118}, {"RNT": 8, "ANDL": 92, "PG": "A", "depth": 45, "ml-RNT": 8, "ml-ANDL": 82}, {"RNT": 7, "ANDL": 73, "PG": "A", "depth": 50, "ml-RNT": 7, "ml-ANDL": 63}, {"RNT": 6, "ANDL": 59, "PG": "A", "depth": 55, "ml-RNT": 6, "ml-ANDL": 49}, {"RNT": 6, "ANDL": 49, "PG": "A", "depth": 60, "ml-RNT": 6, "ml-ANDL": 40}, {"RNT": 5, "ANDL": 40, "PG": "A", "depth": 65, "ml-RNT": 5, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 35, "PG": "A", "depth": 70, "ml-RNT": 5, "ml-ANDL": 30}, {"RNT": 4, "ANDL": 31, "PG": "A", "depth": 75, "ml-RNT": 4, "ml-ANDL": 27}, {"RNT": 4, "ANDL": 26, "PG": "A", "depth": 80, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 85}, {"RNT": 4, "ANDL": 21, "PG": "A", "depth": 90}, {"RNT": 3, "ANDL": 19, "PG": "A", "depth": 95}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 100}, {"RNT": 3, "ANDL": 13, "PG": "A", "depth": 110}, {"RNT": 3, "ANDL": 10, "PG": "A", "depth": 120}, {"RNT": 3, "ANDL": 7, "PG": "A", "depth": 130}], 
// "B": [{"RNT": 19, "ANDL": 186, "PG": "B", "depth": 35, "ml-RNT": 19, "ml-ANDL": 171}, {"RNT": 16, "ANDL": 124, "PG": "B", "depth": 40, "ml-RNT": 16, "ml-ANDL": 111}, {"RNT": 14, "ANDL": 86, "PG": "B", "depth": 45, "ml-RNT": 14, "ml-ANDL": 76}, {"RNT": 13, "ANDL": 67, "PG": "B", "depth": 50, "ml-RNT": 13, "ml-ANDL": 57}, {"RNT": 11, "ANDL": 54, "PG": "B", "depth": 55, "ml-RNT": 11, "ml-ANDL": 44}, {"RNT": 11, "ANDL": 44, "PG": "B", "depth": 60, "ml-RNT": 11, "ml-ANDL": 35}, {"RNT": 9, "ANDL": 36, "PG": "B", "depth": 65, "ml-RNT": 9, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 31, "PG": "B", "depth": 70, "ml-RNT": 9, "ml-ANDL": 26}, {"RNT": 8, "ANDL": 27, "PG": "B", "depth": 75, "ml-RNT": 8, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 22, "PG": "B", "depth": 80, "ml-RNT": 7, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 85}, {"RNT": 7, "ANDL": 18, "PG": "B", "depth": 90}, {"RNT": 6, "ANDL": 16, "PG": "B", "depth": 95}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 100}, {"RNT": 6, "ANDL": 10, "PG": "B", "depth": 110}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 120}, {"RNT": 5, "ANDL": 5, "PG": "B", "depth": 130}], 
// "C": [{"RNT": 25, "ANDL": 180, "PG": "C", "depth": 35, "ml-RNT": 25, "ml-ANDL": 165}, {"RNT": 22, "ANDL": 118, "PG": "C", "depth": 40, "ml-RNT": 22, "ml-ANDL": 105}, {"RNT": 19, "ANDL": 81, "PG": "C", "depth": 45, "ml-RNT": 19, "ml-ANDL": 71}, {"RNT": 17, "ANDL": 63, "PG": "C", "depth": 50, "ml-RNT": 17, "ml-ANDL": 53}, {"RNT": 15, "ANDL": 50, "PG": "C", "depth": 55, "ml-RNT": 15, "ml-ANDL": 40}, {"RNT": 14, "ANDL": 41, "PG": "C", "depth": 60, "ml-RNT": 14, "ml-ANDL": 32}, {"RNT": 12, "ANDL": 33, "PG": "C", "depth": 65, "ml-RNT": 12, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 28, "PG": "C", "depth": 70, "ml-RNT": 12, "ml-ANDL": 23}, {"RNT": 11, "ANDL": 24, "PG": "C", "depth": 75, "ml-RNT": 11, "ml-ANDL": 20}, {"RNT": 10, "ANDL": 20, "PG": "C", "depth": 80, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 85}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 90}, {"RNT": 8, "ANDL": 14, "PG": "C", "depth": 95}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 100}, {"RNT": 7, "ANDL": 9, "PG": "C", "depth": 110}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 120}, {"RNT": 6, "ANDL": 4, "PG": "C", "depth": 130}], 
// "D": [{"RNT": 29, "ANDL": 176, "PG": "D", "depth": 35, "ml-RNT": 29, "ml-ANDL": 161}, {"RNT": 25, "ANDL": 115, "PG": "D", "depth": 40, "ml-RNT": 25, "ml-ANDL": 102}, {"RNT": 21, "ANDL": 79, "PG": "D", "depth": 45, "ml-RNT": 21, "ml-ANDL": 69}, {"RNT": 19, "ANDL": 61, "PG": "D", "depth": 50, "ml-RNT": 19, "ml-ANDL": 51}, {"RNT": 17, "ANDL": 48, "PG": "D", "depth": 55, "ml-RNT": 17, "ml-ANDL": 38}, {"RNT": 16, "ANDL": 39, "PG": "D", "depth": 60, "ml-RNT": 16, "ml-ANDL": 30}, {"RNT": 14, "ANDL": 31, "PG": "D", "depth": 65, "ml-RNT": 14, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 27, "PG": "D", "depth": 70, "ml-RNT": 13, "ml-ANDL": 22}, {"RNT": 12, "ANDL": 23, "PG": "D", "depth": 75, "ml-RNT": 12, "ml-ANDL": 19}, {"RNT": 11, "ANDL": 19, "PG": "D", "depth": 80, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 85}, {"RNT": 10, "ANDL": 15, "PG": "D", "depth": 90}, {"RNT": 9, "ANDL": 13, "PG": "D", "depth": 95}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 100}, {"RNT": 8, "ANDL": 8, "PG": "D", "depth": 110}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 120}, {"RNT": 7, "ANDL": 3, "PG": "D", "depth": 130}], 
// "E": [{"RNT": 32, "ANDL": 173, "PG": "E", "depth": 35, "ml-RNT": 32, "ml-ANDL": 158}, {"RNT": 27, "ANDL": 113, "PG": "E", "depth": 40, "ml-RNT": 27, "ml-ANDL": 100}, {"RNT": 24, "ANDL": 76, "PG": "E", "depth": 45, "ml-RNT": 24, "ml-ANDL": 66}, {"RNT": 21, "ANDL": 59, "PG": "E", "depth": 50, "ml-RNT": 21, "ml-ANDL": 49}, {"RNT": 19, "ANDL": 46, "PG": "E", "depth": 55, "ml-RNT": 19, "ml-ANDL": 36}, {"RNT": 17, "ANDL": 38, "PG": "E", "depth": 60, "ml-RNT": 17, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 65, "ml-RNT": 16, "ml-ANDL": 23}, {"RNT": 15, "ANDL": 25, "PG": "E", "depth": 70, "ml-RNT": 15, "ml-ANDL": 20}, {"RNT": 13, "ANDL": 22, "PG": "E", "depth": 75, "ml-RNT": 13, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 17, "PG": "E", "depth": 80, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 12, "ANDL": 15, "PG": "E", "depth": 85}, {"RNT": 11, "ANDL": 14, "PG": "E", "depth": 90}, {"RNT": 10, "ANDL": 12, "PG": "E", "depth": 95}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 100}, {"RNT": 9, "ANDL": 7, "PG": "E", "depth": 110}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 120}, {"RNT": 8, "ANDL": 0, "PG": "E", "depth": 130}], 
// "F": [{"RNT": 36, "ANDL": 169, "PG": "F", "depth": 35, "ml-RNT": 36, "ml-ANDL": 154}, {"RNT": 31, "ANDL": 109, "PG": "F", "depth": 40, "ml-RNT": 31, "ml-ANDL": 96}, {"RNT": 26, "ANDL": 74, "PG": "F", "depth": 45, "ml-RNT": 26, "ml-ANDL": 64}, {"RNT": 24, "ANDL": 56, "PG": "F", "depth": 50, "ml-RNT": 24, "ml-ANDL": 46}, {"RNT": 21, "ANDL": 44, "PG": "F", "depth": 55, "ml-RNT": 21, "ml-ANDL": 34}, {"RNT": 19, "ANDL": 36, "PG": "F", "depth": 60, "ml-RNT": 19, "ml-ANDL": 27}, {"RNT": 17, "ANDL": 28, "PG": "F", "depth": 65, "ml-RNT": 17, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 24, "PG": "F", "depth": 70, "ml-RNT": 16, "ml-ANDL": 19}, {"RNT": 15, "ANDL": 20, "PG": "F", "depth": 75, "ml-RNT": 15, "ml-ANDL": 16}, {"RNT": 14, "ANDL": 16, "PG": "F", "depth": 80, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 85}, {"RNT": 12, "ANDL": 13, "PG": "F", "depth": 90}, {"RNT": 11, "ANDL": 11, "PG": "F", "depth": 95}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 100}, {"RNT": 10, "ANDL": 6, "PG": "F", "depth": 110}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 120}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 130}], 
// "G": [{"RNT": 40, "ANDL": 165, "PG": "G", "depth": 35, "ml-RNT": 40, "ml-ANDL": 150}, {"RNT": 34, "ANDL": 106, "PG": "G", "depth": 40, "ml-RNT": 34, "ml-ANDL": 93}, {"RNT": 29, "ANDL": 71, "PG": "G", "depth": 45, "ml-RNT": 29, "ml-ANDL": 61}, {"RNT": 26, "ANDL": 54, "PG": "G", "depth": 50, "ml-RNT": 26, "ml-ANDL": 44}, {"RNT": 23, "ANDL": 42, "PG": "G", "depth": 55, "ml-RNT": 23, "ml-ANDL": 32}, {"RNT": 21, "ANDL": 34, "PG": "G", "depth": 60, "ml-RNT": 21, "ml-ANDL": 25}, {"RNT": 19, "ANDL": 26, "PG": "G", "depth": 65, "ml-RNT": 19, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 22, "PG": "G", "depth": 70, "ml-RNT": 18, "ml-ANDL": 17}, {"RNT": 16, "ANDL": 19, "PG": "G", "depth": 75, "ml-RNT": 16, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 15, "PG": "G", "depth": 80, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 85}, {"RNT": 13, "ANDL": 12, "PG": "G", "depth": 90}, {"RNT": 12, "ANDL": 10, "PG": "G", "depth": 95}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 100}, {"RNT": 11, "ANDL": 5, "PG": "G", "depth": 110}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 120}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 130}], 
// "H": [{"RNT": 44, "ANDL": 161, "PG": "H", "depth": 35, "ml-RNT": 44, "ml-ANDL": 146}, {"RNT": 37, "ANDL": 103, "PG": "H", "depth": 40, "ml-RNT": 37, "ml-ANDL": 90}, {"RNT": 32, "ANDL": 68, "PG": "H", "depth": 45, "ml-RNT": 32, "ml-ANDL": 58}, {"RNT": 28, "ANDL": 52, "PG": "H", "depth": 50, "ml-RNT": 28, "ml-ANDL": 42}, {"RNT": 25, "ANDL": 40, "PG": "H", "depth": 55, "ml-RNT": 25, "ml-ANDL": 30}, {"RNT": 23, "ANDL": 32, "PG": "H", "depth": 60, "ml-RNT": 23, "ml-ANDL": 22}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 65, "ml-RNT": 21, "ml-ANDL": 18}, {"RNT": 19, "ANDL": 21, "PG": "H", "depth": 70, "ml-RNT": 19, "ml-ANDL": 16}, {"RNT": 17, "ANDL": 18, "PG": "H", "depth": 75, "ml-RNT": 17, "ml-ANDL": 14}, {"RNT": 17, "ANDL": 13, "PG": "H", "depth": 80, "ml-RNT": 17, "ml-ANDL": 11}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 85}, {"RNT": 15, "ANDL": 10, "PG": "H", "depth": 90}, {"RNT": 13, "ANDL": 9, "PG": "H", "depth": 95}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 100}, {"RNT": 12, "ANDL": 4, "PG": "H", "depth": 110}, {"RNT": 11, "ANDL": 2, "PG": "H", "depth": 120}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 130}], 
// "I": [{"RNT": 48, "ANDL": 157, "PG": "I", "depth": 35, "ml-RNT": 48, "ml-ANDL": 142}, {"RNT": 40, "ANDL": 100, "PG": "I", "depth": 40, "ml-RNT": 40, "ml-ANDL": 87}, {"RNT": 35, "ANDL": 65, "PG": "I", "depth": 45, "ml-RNT": 35, "ml-ANDL": 55}, {"RNT": 31, "ANDL": 49, "PG": "I", "depth": 50, "ml-RNT": 31, "ml-ANDL": 39}, {"RNT": 27, "ANDL": 38, "PG": "I", "depth": 55, "ml-RNT": 27, "ml-ANDL": 28}, {"RNT": 25, "ANDL": 30, "PG": "I", "depth": 60, "ml-RNT": 25, "ml-ANDL": 21}, {"RNT": 22, "ANDL": 23, "PG": "I", "depth": 65, "ml-RNT": 22, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 19, "PG": "I", "depth": 70, "ml-RNT": 21, "ml-ANDL": 14}, {"RNT": 19, "ANDL": 16, "PG": "I", "depth": 75, "ml-RNT": 19, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 12, "PG": "I", "depth": 80, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 85}, {"RNT": 16, "ANDL": 9, "PG": "I", "depth": 90}, {"RNT": 14, "ANDL": 8, "PG": "I", "depth": 95}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 100}, {"RNT": 13, "ANDL": 3, "PG": "I", "depth": 110}, {"RNT": 12, "ANDL": 0, "PG": "I", "depth": 120}], 
// "J": [{"RNT": 52, "ANDL": 153, "PG": "J", "depth": 35, "ml-RNT": 52, "ml-ANDL": 138}, {"RNT": 44, "ANDL": 96, "PG": "J", "depth": 40, "ml-RNT": 44, "ml-ANDL": 83}, {"RNT": 38, "ANDL": 62, "PG": "J", "depth": 45, "ml-RNT": 38, "ml-ANDL": 52}, {"RNT": 33, "ANDL": 47, "PG": "J", "depth": 50, "ml-RNT": 33, "ml-ANDL": 37}, {"RNT": 29, "ANDL": 36, "PG": "J", "depth": 55, "ml-RNT": 29, "ml-ANDL": 26}, {"RNT": 27, "ANDL": 28, "PG": "J", "depth": 60, "ml-RNT": 27, "ml-ANDL": 19}, {"RNT": 24, "ANDL": 21, "PG": "J", "depth": 65, "ml-RNT": 24, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 18, "PG": "J", "depth": 70, "ml-RNT": 22, "ml-ANDL": 13}, {"RNT": 20, "ANDL": 15, "PG": "J", "depth": 75, "ml-RNT": 20, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 11, "PG": "J", "depth": 80, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 18, "ANDL": 9, "PG": "J", "depth": 85}, {"RNT": 17, "ANDL": 8, "PG": "J", "depth": 90}, {"RNT": 15, "ANDL": 7, "PG": "J", "depth": 95}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 100}, {"RNT": 14, "ANDL": 2, "PG": "J", "depth": 110}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 120}], 
// "K": [{"RNT": 57, "ANDL": 148, "PG": "K", "depth": 35, "ml-RNT": 57, "ml-ANDL": 133}, {"RNT": 48, "ANDL": 92, "PG": "K", "depth": 40, "ml-RNT": 48, "ml-ANDL": 79}, {"RNT": 41, "ANDL": 59, "PG": "K", "depth": 45, "ml-RNT": 41, "ml-ANDL": 49}, {"RNT": 36, "ANDL": 44, "PG": "K", "depth": 50, "ml-RNT": 36, "ml-ANDL": 34}, {"RNT": 32, "ANDL": 33, "PG": "K", "depth": 55, "ml-RNT": 32, "ml-ANDL": 23}, {"RNT": 29, "ANDL": 26, "PG": "K", "depth": 60, "ml-RNT": 29, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 65, "ml-RNT": 26, "ml-ANDL": 13}, {"RNT": 24, "ANDL": 16, "PG": "K", "depth": 70, "ml-RNT": 24, "ml-ANDL": 11}, {"RNT": 22, "ANDL": 13, "PG": "K", "depth": 75, "ml-RNT": 22, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 9, "PG": "K", "depth": 80, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 85}, {"RNT": 18, "ANDL": 7, "PG": "K", "depth": 90}, {"RNT": 17, "ANDL": 5, "PG": "K", "depth": 95}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 100}, {"RNT": 14, "ANDL": 2, "PG": "K", "depth": 110}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 120}], 
// "L": [{"RNT": 62, "ANDL": 143, "PG": "L", "depth": 35, "ml-RNT": 62, "ml-ANDL": 128}, {"RNT": 51, "ANDL": 89, "PG": "L", "depth": 40, "ml-RNT": 51, "ml-ANDL": 76}, {"RNT": 44, "ANDL": 56, "PG": "L", "depth": 45, "ml-RNT": 44, "ml-ANDL": 46}, {"RNT": 38, "ANDL": 42, "PG": "L", "depth": 50, "ml-RNT": 38, "ml-ANDL": 32}, {"RNT": 34, "ANDL": 31, "PG": "L", "depth": 55, "ml-RNT": 34, "ml-ANDL": 21}, {"RNT": 31, "ANDL": 24, "PG": "L", "depth": 60, "ml-RNT": 31, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 65, "ml-RNT": 28, "ml-ANDL": 11}, {"RNT": 26, "ANDL": 14, "PG": "L", "depth": 70, "ml-RNT": 26, "ml-ANDL": 9}, {"RNT": 23, "ANDL": 12, "PG": "L", "depth": 75, "ml-RNT": 23, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 8, "PG": "L", "depth": 80, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 85}, {"RNT": 19, "ANDL": 6, "PG": "L", "depth": 90}, {"RNT": 18, "ANDL": 4, "PG": "L", "depth": 95}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 100}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 110}], 
// "M": [{"RNT": 67, "ANDL": 138, "PG": "M", "depth": 35, "ml-RNT": 67, "ml-ANDL": 123}, {"RNT": 55, "ANDL": 85, "PG": "M", "depth": 40, "ml-RNT": 55, "ml-ANDL": 72}, {"RNT": 47, "ANDL": 53, "PG": "M", "depth": 45, "ml-RNT": 47, "ml-ANDL": 43}, {"RNT": 41, "ANDL": 39, "PG": "M", "depth": 50, "ml-RNT": 41, "ml-ANDL": 29}, {"RNT": 36, "ANDL": 29, "PG": "M", "depth": 55, "ml-RNT": 36, "ml-ANDL": 19}, {"RNT": 33, "ANDL": 22, "PG": "M", "depth": 60, "ml-RNT": 33, "ml-ANDL": 13}, {"RNT": 29, "ANDL": 16, "PG": "M", "depth": 65, "ml-RNT": 29, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 13, "PG": "M", "depth": 70, "ml-RNT": 27, "ml-ANDL": 8}, {"RNT": 25, "ANDL": 10, "PG": "M", "depth": 75, "ml-RNT": 25, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 7, "PG": "M", "depth": 80, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 85}, {"RNT": 21, "ANDL": 4, "PG": "M", "depth": 90}, {"RNT": 19, "ANDL": 3, "PG": "M", "depth": 95}, {"RNT": 18, "ANDL": 2, "PG": "M", "depth": 100}, {"RNT": 16, "ANDL": 0, "PG": "M", "depth": 110}], 
// "N": [{"RNT": 73, "ANDL": 132, "PG": "N", "depth": 35, "ml-RNT": 73, "ml-ANDL": 117}, {"RNT": 60, "ANDL": 80, "PG": "N", "depth": 40, "ml-RNT": 60, "ml-ANDL": 67}, {"RNT": 50, "ANDL": 50, "PG": "N", "depth": 45, "ml-RNT": 50, "ml-ANDL": 40}, {"RNT": 44, "ANDL": 36, "PG": "N", "depth": 50, "ml-RNT": 44, "ml-ANDL": 26}, {"RNT": 38, "ANDL": 27, "PG": "N", "depth": 55, "ml-RNT": 38, "ml-ANDL": 17}, {"RNT": 35, "ANDL": 20, "PG": "N", "depth": 60, "ml-RNT": 35, "ml-ANDL": 11}, {"RNT": 31, "ANDL": 14, "PG": "N", "depth": 65, "ml-RNT": 31, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 11, "PG": "N", "depth": 70, "ml-RNT": 29, "ml-ANDL": 6}, {"RNT": 26, "ANDL": 9, "PG": "N", "depth": 75, "ml-RNT": 26, "ml-ANDL": 5}, {"RNT": 25, "ANDL": 5, "PG": "N", "depth": 80, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 85}, {"RNT": 22, "ANDL": 3, "PG": "N", "depth": 90}, {"RNT": 20, "ANDL": 2, "PG": "N", "depth": 95}, {"RNT": 19, "ANDL": 0, "PG": "N", "depth": 100}], 
// "O": [{"RNT": 79, "ANDL": 126, "PG": "O", "depth": 35, "ml-RNT": 79, "ml-ANDL": 111}, {"RNT": 64, "ANDL": 76, "PG": "O", "depth": 40, "ml-RNT": 64, "ml-ANDL": 63}, {"RNT": 54, "ANDL": 46, "PG": "O", "depth": 45, "ml-RNT": 54, "ml-ANDL": 36}, {"RNT": 47, "ANDL": 33, "PG": "O", "depth": 50, "ml-RNT": 47, "ml-ANDL": 23}, {"RNT": 41, "ANDL": 24, "PG": "O", "depth": 55, "ml-RNT": 41, "ml-ANDL": 14}, {"RNT": 37, "ANDL": 18, "PG": "O", "depth": 60, "ml-RNT": 37, "ml-ANDL": 9}, {"RNT": 33, "ANDL": 12, "PG": "O", "depth": 65, "ml-RNT": 33, "ml-ANDL": 6}, {"RNT": 31, "ANDL": 9, "PG": "O", "depth": 70, "ml-RNT": 31, "ml-ANDL": 4}, {"RNT": 28, "ANDL": 7, "PG": "O", "depth": 75, "ml-RNT": 28, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 4, "PG": "O", "depth": 80, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 85}, {"RNT": 23, "ANDL": 2, "PG": "O", "depth": 90}, {"RNT": 21, "ANDL": 0, "PG": "O", "depth": 95}, {"RNT": 20, "ANDL": 0, "PG": "O", "depth": 100}], 
// "P": [{"RNT": 85, "ANDL": 120, "PG": "P", "depth": 35, "ml-RNT": 85, "ml-ANDL": 105}, {"RNT": 69, "ANDL": 71, "PG": "P", "depth": 40, "ml-RNT": 69, "ml-ANDL": 58}, {"RNT": 58, "ANDL": 42, "PG": "P", "depth": 45, "ml-RNT": 58, "ml-ANDL": 32}, {"RNT": 50, "ANDL": 30, "PG": "P", "depth": 50, "ml-RNT": 50, "ml-ANDL": 20}, {"RNT": 44, "ANDL": 21, "PG": "P", "depth": 55, "ml-RNT": 44, "ml-ANDL": 11}, {"RNT": 39, "ANDL": 16, "PG": "P", "depth": 60, "ml-RNT": 39, "ml-ANDL": 7}, {"RNT": 35, "ANDL": 10, "PG": "P", "depth": 65, "ml-RNT": 35, "ml-ANDL": 4}, {"RNT": 33, "ANDL": 7, "PG": "P", "depth": 70, "ml-RNT": 33, "ml-ANDL": 2}, {"RNT": 30, "ANDL": 5, "PG": "P", "depth": 75, "ml-RNT": 30}, {"RNT": 28, "ANDL": 2, "PG": "P", "depth": 80, "ml-RNT": 28}, {"RNT": 26, "ANDL": 0, "PG": "P", "depth": 85}, {"RNT": 24, "ANDL": 0, "PG": "P", "depth": 90}, {"RNT": 22, "ANDL": 0, "PG": "P", "depth": 95}], 
// "Q": [{"RNT": 92, "ANDL": 113, "PG": "Q", "depth": 35, "ml-RNT": 92, "ml-ANDL": 98}, {"RNT": 74, "ANDL": 66, "PG": "Q", "depth": 40, "ml-RNT": 74, "ml-ANDL": 53}, {"RNT": 61, "ANDL": 39, "PG": "Q", "depth": 45, "ml-RNT": 61, "ml-ANDL": 29}, {"RNT": 53, "ANDL": 27, "PG": "Q", "depth": 50, "ml-RNT": 53, "ml-ANDL": 17}, {"RNT": 46, "ANDL": 19, "PG": "Q", "depth": 55, "ml-RNT": 46, "ml-ANDL": 9}, {"RNT": 42, "ANDL": 13, "PG": "Q", "depth": 60, "ml-RNT": 42, "ml-ANDL": 4}, {"RNT": 37, "ANDL": 8, "PG": "Q", "depth": 65, "ml-RNT": 37, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 6, "PG": "Q", "depth": 70, "ml-RNT": 35}, {"RNT": 31, "ANDL": 4, "PG": "Q", "depth": 75, "ml-RNT": 31}, {"RNT": 29, "ANDL": 0, "PG": "Q", "depth": 80}, {"RNT": 27, "ANDL": 0, "PG": "Q", "depth": 85}, {"RNT": 25, "ANDL": 0, "PG": "Q", "depth": 90}], 
// "R": [{"RNT": 100, "ANDL": 105, "PG": "R", "depth": 35, "ml-RNT": 100, "ml-ANDL": 90}, {"RNT": 79, "ANDL": 61, "PG": "R", "depth": 40, "ml-RNT": 79, "ml-ANDL": 48}, {"RNT": 66, "ANDL": 34, "PG": "R", "depth": 45, "ml-RNT": 66, "ml-ANDL": 24}, {"RNT": 57, "ANDL": 23, "PG": "R", "depth": 50, "ml-RNT": 57, "ml-ANDL": 13}, {"RNT": 49, "ANDL": 16, "PG": "R", "depth": 55, "ml-RNT": 49, "ml-ANDL": 6}, {"RNT": 44, "ANDL": 11, "PG": "R", "depth": 60, "ml-RNT": 44, "ml-ANDL": 2}, {"RNT": 39, "ANDL": 6, "PG": "R", "depth": 65, "ml-RNT": 39}, {"RNT": 36, "ANDL": 4, "PG": "R", "depth": 70}, {"RNT": 33, "ANDL": 2, "PG": "R", "depth": 75}, {"RNT": 30, "ANDL": 0, "PG": "R", "depth": 80}], 
// "S": [{"RNT": 108, "ANDL": 97, "PG": "S", "depth": 35, "ml-RNT": 108, "ml-ANDL": 82}, {"RNT": 85, "ANDL": 55, "PG": "S", "depth": 40, "ml-RNT": 85, "ml-ANDL": 42}, {"RNT": 70, "ANDL": 30, "PG": "S", "depth": 45, "ml-RNT": 70, "ml-ANDL": 20}, {"RNT": 60, "ANDL": 20, "PG": "S", "depth": 50, "ml-RNT": 60, "ml-ANDL": 10}, {"RNT": 52, "ANDL": 13, "PG": "S", "depth": 55, "ml-RNT": 52, "ml-ANDL": 3}, {"RNT": 47, "ANDL": 8, "PG": "S", "depth": 60, "ml-RNT": 46}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 65}, {"RNT": 38, "ANDL": 2, "PG": "S", "depth": 70}, {"RNT": 35, "ANDL": 0, "PG": "S", "depth": 75}], 
// "T": [{"RNT": 117, "ANDL": 88, "PG": "T", "depth": 35, "ml-RNT": 117, "ml-ANDL": 73}, {"RNT": 91, "ANDL": 49, "PG": "T", "depth": 40, "ml-RNT": 91, "ml-ANDL": 36}, {"RNT": 74, "ANDL": 26, "PG": "T", "depth": 45, "ml-RNT": 74, "ml-ANDL": 16}, {"RNT": 63, "ANDL": 17, "PG": "T", "depth": 50, "ml-RNT": 63, "ml-ANDL": 7}, {"RNT": 55, "ANDL": 10, "PG": "T", "depth": 55, "ml-RNT": 55}, {"RNT": 49, "ANDL": 6, "PG": "T", "depth": 60}, {"RNT": 43, "ANDL": 2, "PG": "T", "depth": 65}, {"RNT": 40, "ANDL": 0, "PG": "T", "depth": 70}], 
// "U": [{"RNT": 127, "ANDL": 78, "PG": "U", "depth": 35, "ml-RNT": 127, "ml-ANDL": 63}, {"RNT": 97, "ANDL": 43, "PG": "U", "depth": 40, "ml-RNT": 97, "ml-ANDL": 30}, {"RNT": 79, "ANDL": 21, "PG": "U", "depth": 45, "ml-RNT": 79, "ml-ANDL": 11}, {"RNT": 67, "ANDL": 13, "PG": "U", "depth": 50, "ml-RNT": 67, "ml-ANDL": 3}, {"RNT": 58, "ANDL": 7, "PG": "U", "depth": 55}, {"RNT": 52, "ANDL": 3, "PG": "U", "depth": 60}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 65}], 
// "V": [{"RNT": 139, "ANDL": 66, "PG": "V", "depth": 35, "ml-RNT": 139, "ml-ANDL": 51}, {"RNT": 104, "ANDL": 36, "PG": "V", "depth": 40, "ml-RNT": 104, "ml-ANDL": 23}, {"RNT": 84, "ANDL": 16, "PG": "V", "depth": 45, "ml-RNT": 84, "ml-ANDL": 6}, {"RNT": 71, "ANDL": 9, "PG": "V", "depth": 50, "ml-RNT": 70}, {"RNT": 61, "ANDL": 4, "PG": "V", "depth": 55}, {"RNT": 54, "ANDL": 1, "PG": "V", "depth": 60}], 
// "W": [{"RNT": 152, "ANDL": 53, "PG": "W", "depth": 35, "ml-RNT": 152, "ml-ANDL": 38}, {"RNT": 111, "ANDL": 29, "PG": "W", "depth": 40, "ml-RNT": 111, "ml-ANDL": 16}, {"RNT": 89, "ANDL": 11, "PG": "W", "depth": 45, "ml-RNT": 89}, {"RNT": 75, "ANDL": 5, "PG": "W", "depth": 50}, {"RNT": 65, "ANDL": 0, "PG": "W", "depth": 55}, {"RNT": 55, "ANDL": 0, "PG": "W", "depth": 60}], 
// "X": [{"RNT": 168, "ANDL": 37, "PG": "X", "depth": 35, "ml-RNT": 168, "ml-ANDL": 22}, {"RNT": 120, "ANDL": 20, "PG": "X", "depth": 40, "ml-RNT": 120, "ml-ANDL": 7}, {"RNT": 95, "ANDL": 5, "PG": "X", "depth": 45, "ml-RNT": 90}, {"RNT": 80, "ANDL": 0, "PG": "X", "depth": 50}], 
// "Y": [{"RNT": 188, "ANDL": 17, "PG": "Y", "depth": 35, "ml-RNT": 190}, {"RNT": 129, "ANDL": 11, "PG": "Y", "depth": 40, "ml-RNT": 127}, {"RNT": 97, "ANDL": 3, "PG": "Y", "depth": 45}], 
// "Z": [{"RNT": 205, "ANDL": 0, "PG": "Z", "depth": 35}, {"RNT": 140, "ANDL": 0, "PG": "Z", "depth": 40}, {"RNT": 100, "ANDL": 0, "PG": "Z", "depth": 45}]}
    

// RDTableFT = //[LMNT 20141208]: New table with "0" added
// {
// "A": [ {"RNT": 10, "ANDL": 195, "PG": "A", "depth": 35, "ml-RNT": 10, "ml-ANDL": 180}, {"RNT": 9, "ANDL": 131, "PG": "A", "depth": 40, "ml-RNT": 9, "ml-ANDL": 118}, {"RNT": 8, "ANDL": 92, "PG": "A", "depth": 45, "ml-RNT": 8, "ml-ANDL": 82}, {"RNT": 7, "ANDL": 73, "PG": "A", "depth": 50, "ml-RNT": 7, "ml-ANDL": 63}, {"RNT": 6, "ANDL": 59, "PG": "A", "depth": 55, "ml-RNT": 6, "ml-ANDL": 49}, {"RNT": 6, "ANDL": 49, "PG": "A", "depth": 60, "ml-RNT": 6, "ml-ANDL": 40}, {"RNT": 5, "ANDL": 40, "PG": "A", "depth": 65, "ml-RNT": 5, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 35, "PG": "A", "depth": 70, "ml-RNT": 5, "ml-ANDL": 30}, {"RNT": 4, "ANDL": 31, "PG": "A", "depth": 75, "ml-RNT": 4, "ml-ANDL": 27}, {"RNT": 4, "ANDL": 26, "PG": "A", "depth": 80, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 85}, {"RNT": 4, "ANDL": 21, "PG": "A", "depth": 90}, {"RNT": 3, "ANDL": 19, "PG": "A", "depth": 95}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 100}, {"RNT": 3, "ANDL": 13, "PG": "A", "depth": 110}, {"RNT": 3, "ANDL": 10, "PG": "A", "depth": 120}, {"RNT": 3, "ANDL": 7, "PG": "A", "depth": 130}], 
// "B": [ {"RNT": 19, "ANDL": 186, "PG": "B", "depth": 35, "ml-RNT": 19, "ml-ANDL": 171}, {"RNT": 16, "ANDL": 124, "PG": "B", "depth": 40, "ml-RNT": 16, "ml-ANDL": 111}, {"RNT": 14, "ANDL": 86, "PG": "B", "depth": 45, "ml-RNT": 14, "ml-ANDL": 76}, {"RNT": 13, "ANDL": 67, "PG": "B", "depth": 50, "ml-RNT": 13, "ml-ANDL": 57}, {"RNT": 11, "ANDL": 54, "PG": "B", "depth": 55, "ml-RNT": 11, "ml-ANDL": 44}, {"RNT": 11, "ANDL": 44, "PG": "B", "depth": 60, "ml-RNT": 11, "ml-ANDL": 35}, {"RNT": 9, "ANDL": 36, "PG": "B", "depth": 65, "ml-RNT": 9, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 31, "PG": "B", "depth": 70, "ml-RNT": 9, "ml-ANDL": 26}, {"RNT": 8, "ANDL": 27, "PG": "B", "depth": 75, "ml-RNT": 8, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 22, "PG": "B", "depth": 80, "ml-RNT": 7, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 85}, {"RNT": 7, "ANDL": 18, "PG": "B", "depth": 90}, {"RNT": 6, "ANDL": 16, "PG": "B", "depth": 95}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 100}, {"RNT": 6, "ANDL": 10, "PG": "B", "depth": 110}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 120}, {"RNT": 5, "ANDL": 5, "PG": "B", "depth": 130}], 
// "C": [ {"RNT": 25, "ANDL": 180, "PG": "C", "depth": 35, "ml-RNT": 25, "ml-ANDL": 165}, {"RNT": 22, "ANDL": 118, "PG": "C", "depth": 40, "ml-RNT": 22, "ml-ANDL": 105}, {"RNT": 19, "ANDL": 81, "PG": "C", "depth": 45, "ml-RNT": 19, "ml-ANDL": 71}, {"RNT": 17, "ANDL": 63, "PG": "C", "depth": 50, "ml-RNT": 17, "ml-ANDL": 53}, {"RNT": 15, "ANDL": 50, "PG": "C", "depth": 55, "ml-RNT": 15, "ml-ANDL": 40}, {"RNT": 14, "ANDL": 41, "PG": "C", "depth": 60, "ml-RNT": 14, "ml-ANDL": 32}, {"RNT": 12, "ANDL": 33, "PG": "C", "depth": 65, "ml-RNT": 12, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 28, "PG": "C", "depth": 70, "ml-RNT": 12, "ml-ANDL": 23}, {"RNT": 11, "ANDL": 24, "PG": "C", "depth": 75, "ml-RNT": 11, "ml-ANDL": 20}, {"RNT": 10, "ANDL": 20, "PG": "C", "depth": 80, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 85}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 90}, {"RNT": 8, "ANDL": 14, "PG": "C", "depth": 95}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 100}, {"RNT": 7, "ANDL": 9, "PG": "C", "depth": 110}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 120}, {"RNT": 6, "ANDL": 4, "PG": "C", "depth": 130}], 
// "D": [ {"RNT": 29, "ANDL": 176, "PG": "D", "depth": 35, "ml-RNT": 29, "ml-ANDL": 161}, {"RNT": 25, "ANDL": 115, "PG": "D", "depth": 40, "ml-RNT": 25, "ml-ANDL": 102}, {"RNT": 21, "ANDL": 79, "PG": "D", "depth": 45, "ml-RNT": 21, "ml-ANDL": 69}, {"RNT": 19, "ANDL": 61, "PG": "D", "depth": 50, "ml-RNT": 19, "ml-ANDL": 51}, {"RNT": 17, "ANDL": 48, "PG": "D", "depth": 55, "ml-RNT": 17, "ml-ANDL": 38}, {"RNT": 16, "ANDL": 39, "PG": "D", "depth": 60, "ml-RNT": 16, "ml-ANDL": 30}, {"RNT": 14, "ANDL": 31, "PG": "D", "depth": 65, "ml-RNT": 14, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 27, "PG": "D", "depth": 70, "ml-RNT": 13, "ml-ANDL": 22}, {"RNT": 12, "ANDL": 23, "PG": "D", "depth": 75, "ml-RNT": 12, "ml-ANDL": 19}, {"RNT": 11, "ANDL": 19, "PG": "D", "depth": 80, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 85}, {"RNT": 10, "ANDL": 15, "PG": "D", "depth": 90}, {"RNT": 9, "ANDL": 13, "PG": "D", "depth": 95}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 100}, {"RNT": 8, "ANDL": 8, "PG": "D", "depth": 110}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 120}, {"RNT": 7, "ANDL": 3, "PG": "D", "depth": 130}], 
// "E": [ {"RNT": 32, "ANDL": 173, "PG": "E", "depth": 35, "ml-RNT": 32, "ml-ANDL": 158}, {"RNT": 27, "ANDL": 113, "PG": "E", "depth": 40, "ml-RNT": 27, "ml-ANDL": 100}, {"RNT": 24, "ANDL": 76, "PG": "E", "depth": 45, "ml-RNT": 24, "ml-ANDL": 66}, {"RNT": 21, "ANDL": 59, "PG": "E", "depth": 50, "ml-RNT": 21, "ml-ANDL": 49}, {"RNT": 19, "ANDL": 46, "PG": "E", "depth": 55, "ml-RNT": 19, "ml-ANDL": 36}, {"RNT": 17, "ANDL": 38, "PG": "E", "depth": 60, "ml-RNT": 17, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 65, "ml-RNT": 16, "ml-ANDL": 23}, {"RNT": 15, "ANDL": 25, "PG": "E", "depth": 70, "ml-RNT": 15, "ml-ANDL": 20}, {"RNT": 13, "ANDL": 22, "PG": "E", "depth": 75, "ml-RNT": 13, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 17, "PG": "E", "depth": 80, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 12, "ANDL": 15, "PG": "E", "depth": 85}, {"RNT": 11, "ANDL": 14, "PG": "E", "depth": 90}, {"RNT": 10, "ANDL": 12, "PG": "E", "depth": 95}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 100}, {"RNT": 9, "ANDL": 7, "PG": "E", "depth": 110}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 120}, {"RNT": 8, "ANDL": 0, "PG": "E", "depth": 130}], 
// "F": [ {"RNT": 36, "ANDL": 169, "PG": "F", "depth": 35, "ml-RNT": 36, "ml-ANDL": 154}, {"RNT": 31, "ANDL": 109, "PG": "F", "depth": 40, "ml-RNT": 31, "ml-ANDL": 96}, {"RNT": 26, "ANDL": 74, "PG": "F", "depth": 45, "ml-RNT": 26, "ml-ANDL": 64}, {"RNT": 24, "ANDL": 56, "PG": "F", "depth": 50, "ml-RNT": 24, "ml-ANDL": 46}, {"RNT": 21, "ANDL": 44, "PG": "F", "depth": 55, "ml-RNT": 21, "ml-ANDL": 34}, {"RNT": 19, "ANDL": 36, "PG": "F", "depth": 60, "ml-RNT": 19, "ml-ANDL": 27}, {"RNT": 17, "ANDL": 28, "PG": "F", "depth": 65, "ml-RNT": 17, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 24, "PG": "F", "depth": 70, "ml-RNT": 16, "ml-ANDL": 19}, {"RNT": 15, "ANDL": 20, "PG": "F", "depth": 75, "ml-RNT": 15, "ml-ANDL": 16}, {"RNT": 14, "ANDL": 16, "PG": "F", "depth": 80, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 85}, {"RNT": 12, "ANDL": 13, "PG": "F", "depth": 90}, {"RNT": 11, "ANDL": 11, "PG": "F", "depth": 95}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 100}, {"RNT": 10, "ANDL": 6, "PG": "F", "depth": 110}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 120}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 130}], 
// "G": [ {"RNT": 40, "ANDL": 165, "PG": "G", "depth": 35, "ml-RNT": 40, "ml-ANDL": 150}, {"RNT": 34, "ANDL": 106, "PG": "G", "depth": 40, "ml-RNT": 34, "ml-ANDL": 93}, {"RNT": 29, "ANDL": 71, "PG": "G", "depth": 45, "ml-RNT": 29, "ml-ANDL": 61}, {"RNT": 26, "ANDL": 54, "PG": "G", "depth": 50, "ml-RNT": 26, "ml-ANDL": 44}, {"RNT": 23, "ANDL": 42, "PG": "G", "depth": 55, "ml-RNT": 23, "ml-ANDL": 32}, {"RNT": 21, "ANDL": 34, "PG": "G", "depth": 60, "ml-RNT": 21, "ml-ANDL": 25}, {"RNT": 19, "ANDL": 26, "PG": "G", "depth": 65, "ml-RNT": 19, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 22, "PG": "G", "depth": 70, "ml-RNT": 18, "ml-ANDL": 17}, {"RNT": 16, "ANDL": 19, "PG": "G", "depth": 75, "ml-RNT": 16, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 15, "PG": "G", "depth": 80, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 85}, {"RNT": 13, "ANDL": 12, "PG": "G", "depth": 90}, {"RNT": 12, "ANDL": 10, "PG": "G", "depth": 95}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 100}, {"RNT": 11, "ANDL": 5, "PG": "G", "depth": 110}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 120}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 130}], 
// "H": [ {"RNT": 44, "ANDL": 161, "PG": "H", "depth": 35, "ml-RNT": 44, "ml-ANDL": 146}, {"RNT": 37, "ANDL": 103, "PG": "H", "depth": 40, "ml-RNT": 37, "ml-ANDL": 90}, {"RNT": 32, "ANDL": 68, "PG": "H", "depth": 45, "ml-RNT": 32, "ml-ANDL": 58}, {"RNT": 28, "ANDL": 52, "PG": "H", "depth": 50, "ml-RNT": 28, "ml-ANDL": 42}, {"RNT": 25, "ANDL": 40, "PG": "H", "depth": 55, "ml-RNT": 25, "ml-ANDL": 30}, {"RNT": 23, "ANDL": 32, "PG": "H", "depth": 60, "ml-RNT": 23, "ml-ANDL": 22}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 65, "ml-RNT": 21, "ml-ANDL": 18}, {"RNT": 19, "ANDL": 21, "PG": "H", "depth": 70, "ml-RNT": 19, "ml-ANDL": 16}, {"RNT": 17, "ANDL": 18, "PG": "H", "depth": 75, "ml-RNT": 17, "ml-ANDL": 14}, {"RNT": 17, "ANDL": 13, "PG": "H", "depth": 80, "ml-RNT": 17, "ml-ANDL": 11}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 85}, {"RNT": 15, "ANDL": 10, "PG": "H", "depth": 90}, {"RNT": 13, "ANDL": 9, "PG": "H", "depth": 95}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 100}, {"RNT": 12, "ANDL": 4, "PG": "H", "depth": 110}, {"RNT": 11, "ANDL": 2, "PG": "H", "depth": 120}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 130}], 
// "I": [ {"RNT": 48, "ANDL": 157, "PG": "I", "depth": 35, "ml-RNT": 48, "ml-ANDL": 142}, {"RNT": 40, "ANDL": 100, "PG": "I", "depth": 40, "ml-RNT": 40, "ml-ANDL": 87}, {"RNT": 35, "ANDL": 65, "PG": "I", "depth": 45, "ml-RNT": 35, "ml-ANDL": 55}, {"RNT": 31, "ANDL": 49, "PG": "I", "depth": 50, "ml-RNT": 31, "ml-ANDL": 39}, {"RNT": 27, "ANDL": 38, "PG": "I", "depth": 55, "ml-RNT": 27, "ml-ANDL": 28}, {"RNT": 25, "ANDL": 30, "PG": "I", "depth": 60, "ml-RNT": 25, "ml-ANDL": 21}, {"RNT": 22, "ANDL": 23, "PG": "I", "depth": 65, "ml-RNT": 22, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 19, "PG": "I", "depth": 70, "ml-RNT": 21, "ml-ANDL": 14}, {"RNT": 19, "ANDL": 16, "PG": "I", "depth": 75, "ml-RNT": 19, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 12, "PG": "I", "depth": 80, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 85}, {"RNT": 16, "ANDL": 9, "PG": "I", "depth": 90}, {"RNT": 14, "ANDL": 8, "PG": "I", "depth": 95}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 100}, {"RNT": 13, "ANDL": 3, "PG": "I", "depth": 110}, {"RNT": 12, "ANDL": 0, "PG": "I", "depth": 120}], 
// "J": [ {"RNT": 52, "ANDL": 153, "PG": "J", "depth": 35, "ml-RNT": 52, "ml-ANDL": 138}, {"RNT": 44, "ANDL": 96, "PG": "J", "depth": 40, "ml-RNT": 44, "ml-ANDL": 83}, {"RNT": 38, "ANDL": 62, "PG": "J", "depth": 45, "ml-RNT": 38, "ml-ANDL": 52}, {"RNT": 33, "ANDL": 47, "PG": "J", "depth": 50, "ml-RNT": 33, "ml-ANDL": 37}, {"RNT": 29, "ANDL": 36, "PG": "J", "depth": 55, "ml-RNT": 29, "ml-ANDL": 26}, {"RNT": 27, "ANDL": 28, "PG": "J", "depth": 60, "ml-RNT": 27, "ml-ANDL": 19}, {"RNT": 24, "ANDL": 21, "PG": "J", "depth": 65, "ml-RNT": 24, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 18, "PG": "J", "depth": 70, "ml-RNT": 22, "ml-ANDL": 13}, {"RNT": 20, "ANDL": 15, "PG": "J", "depth": 75, "ml-RNT": 20, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 11, "PG": "J", "depth": 80, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 18, "ANDL": 9, "PG": "J", "depth": 85}, {"RNT": 17, "ANDL": 8, "PG": "J", "depth": 90}, {"RNT": 15, "ANDL": 7, "PG": "J", "depth": 95}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 100}, {"RNT": 14, "ANDL": 2, "PG": "J", "depth": 110}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 120}], 
// "K": [ {"RNT": 57, "ANDL": 148, "PG": "K", "depth": 35, "ml-RNT": 57, "ml-ANDL": 133}, {"RNT": 48, "ANDL": 92, "PG": "K", "depth": 40, "ml-RNT": 48, "ml-ANDL": 79}, {"RNT": 41, "ANDL": 59, "PG": "K", "depth": 45, "ml-RNT": 41, "ml-ANDL": 49}, {"RNT": 36, "ANDL": 44, "PG": "K", "depth": 50, "ml-RNT": 36, "ml-ANDL": 34}, {"RNT": 32, "ANDL": 33, "PG": "K", "depth": 55, "ml-RNT": 32, "ml-ANDL": 23}, {"RNT": 29, "ANDL": 26, "PG": "K", "depth": 60, "ml-RNT": 29, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 65, "ml-RNT": 26, "ml-ANDL": 13}, {"RNT": 24, "ANDL": 16, "PG": "K", "depth": 70, "ml-RNT": 24, "ml-ANDL": 11}, {"RNT": 22, "ANDL": 13, "PG": "K", "depth": 75, "ml-RNT": 22, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 9, "PG": "K", "depth": 80, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 85}, {"RNT": 18, "ANDL": 7, "PG": "K", "depth": 90}, {"RNT": 17, "ANDL": 5, "PG": "K", "depth": 95}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 100}, {"RNT": 14, "ANDL": 2, "PG": "K", "depth": 110}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 120}], 
// "L": [ {"RNT": 62, "ANDL": 143, "PG": "L", "depth": 35, "ml-RNT": 62, "ml-ANDL": 128}, {"RNT": 51, "ANDL": 89, "PG": "L", "depth": 40, "ml-RNT": 51, "ml-ANDL": 76}, {"RNT": 44, "ANDL": 56, "PG": "L", "depth": 45, "ml-RNT": 44, "ml-ANDL": 46}, {"RNT": 38, "ANDL": 42, "PG": "L", "depth": 50, "ml-RNT": 38, "ml-ANDL": 32}, {"RNT": 34, "ANDL": 31, "PG": "L", "depth": 55, "ml-RNT": 34, "ml-ANDL": 21}, {"RNT": 31, "ANDL": 24, "PG": "L", "depth": 60, "ml-RNT": 31, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 65, "ml-RNT": 28, "ml-ANDL": 11}, {"RNT": 26, "ANDL": 14, "PG": "L", "depth": 70, "ml-RNT": 26, "ml-ANDL": 9}, {"RNT": 23, "ANDL": 12, "PG": "L", "depth": 75, "ml-RNT": 23, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 8, "PG": "L", "depth": 80, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 85}, {"RNT": 19, "ANDL": 6, "PG": "L", "depth": 90}, {"RNT": 18, "ANDL": 4, "PG": "L", "depth": 95}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 100}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 110}], 
// "M": [ {"RNT": 67, "ANDL": 138, "PG": "M", "depth": 35, "ml-RNT": 67, "ml-ANDL": 123}, {"RNT": 55, "ANDL": 85, "PG": "M", "depth": 40, "ml-RNT": 55, "ml-ANDL": 72}, {"RNT": 47, "ANDL": 53, "PG": "M", "depth": 45, "ml-RNT": 47, "ml-ANDL": 43}, {"RNT": 41, "ANDL": 39, "PG": "M", "depth": 50, "ml-RNT": 41, "ml-ANDL": 29}, {"RNT": 36, "ANDL": 29, "PG": "M", "depth": 55, "ml-RNT": 36, "ml-ANDL": 19}, {"RNT": 33, "ANDL": 22, "PG": "M", "depth": 60, "ml-RNT": 33, "ml-ANDL": 13}, {"RNT": 29, "ANDL": 16, "PG": "M", "depth": 65, "ml-RNT": 29, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 13, "PG": "M", "depth": 70, "ml-RNT": 27, "ml-ANDL": 8}, {"RNT": 25, "ANDL": 10, "PG": "M", "depth": 75, "ml-RNT": 25, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 7, "PG": "M", "depth": 80, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 85}, {"RNT": 21, "ANDL": 4, "PG": "M", "depth": 90}, {"RNT": 19, "ANDL": 3, "PG": "M", "depth": 95}, {"RNT": 18, "ANDL": 2, "PG": "M", "depth": 100}, {"RNT": 16, "ANDL": 0, "PG": "M", "depth": 110}], 
// "N": [ {"RNT": 73, "ANDL": 132, "PG": "N", "depth": 35, "ml-RNT": 73, "ml-ANDL": 117}, {"RNT": 60, "ANDL": 80, "PG": "N", "depth": 40, "ml-RNT": 60, "ml-ANDL": 67}, {"RNT": 50, "ANDL": 50, "PG": "N", "depth": 45, "ml-RNT": 50, "ml-ANDL": 40}, {"RNT": 44, "ANDL": 36, "PG": "N", "depth": 50, "ml-RNT": 44, "ml-ANDL": 26}, {"RNT": 38, "ANDL": 27, "PG": "N", "depth": 55, "ml-RNT": 38, "ml-ANDL": 17}, {"RNT": 35, "ANDL": 20, "PG": "N", "depth": 60, "ml-RNT": 35, "ml-ANDL": 11}, {"RNT": 31, "ANDL": 14, "PG": "N", "depth": 65, "ml-RNT": 31, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 11, "PG": "N", "depth": 70, "ml-RNT": 29, "ml-ANDL": 6}, {"RNT": 26, "ANDL": 9, "PG": "N", "depth": 75, "ml-RNT": 26, "ml-ANDL": 5}, {"RNT": 25, "ANDL": 5, "PG": "N", "depth": 80, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 85}, {"RNT": 22, "ANDL": 3, "PG": "N", "depth": 90}, {"RNT": 20, "ANDL": 2, "PG": "N", "depth": 95}, {"RNT": 19, "ANDL": 0, "PG": "N", "depth": 100}], 
// "O": [ {"RNT": 79, "ANDL": 126, "PG": "O", "depth": 35, "ml-RNT": 79, "ml-ANDL": 111}, {"RNT": 64, "ANDL": 76, "PG": "O", "depth": 40, "ml-RNT": 64, "ml-ANDL": 63}, {"RNT": 54, "ANDL": 46, "PG": "O", "depth": 45, "ml-RNT": 54, "ml-ANDL": 36}, {"RNT": 47, "ANDL": 33, "PG": "O", "depth": 50, "ml-RNT": 47, "ml-ANDL": 23}, {"RNT": 41, "ANDL": 24, "PG": "O", "depth": 55, "ml-RNT": 41, "ml-ANDL": 14}, {"RNT": 37, "ANDL": 18, "PG": "O", "depth": 60, "ml-RNT": 37, "ml-ANDL": 9}, {"RNT": 33, "ANDL": 12, "PG": "O", "depth": 65, "ml-RNT": 33, "ml-ANDL": 6}, {"RNT": 31, "ANDL": 9, "PG": "O", "depth": 70, "ml-RNT": 31, "ml-ANDL": 4}, {"RNT": 28, "ANDL": 7, "PG": "O", "depth": 75, "ml-RNT": 28, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 4, "PG": "O", "depth": 80, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 85}, {"RNT": 23, "ANDL": 2, "PG": "O", "depth": 90}, {"RNT": 21, "ANDL": 0, "PG": "O", "depth": 95}, {"RNT": 20, "ANDL": 0, "PG": "O", "depth": 100}], 
// "P": [ {"RNT": 85, "ANDL": 120, "PG": "P", "depth": 35, "ml-RNT": 85, "ml-ANDL": 105}, {"RNT": 69, "ANDL": 71, "PG": "P", "depth": 40, "ml-RNT": 69, "ml-ANDL": 58}, {"RNT": 58, "ANDL": 42, "PG": "P", "depth": 45, "ml-RNT": 58, "ml-ANDL": 32}, {"RNT": 50, "ANDL": 30, "PG": "P", "depth": 50, "ml-RNT": 50, "ml-ANDL": 20}, {"RNT": 44, "ANDL": 21, "PG": "P", "depth": 55, "ml-RNT": 44, "ml-ANDL": 11}, {"RNT": 39, "ANDL": 16, "PG": "P", "depth": 60, "ml-RNT": 39, "ml-ANDL": 7}, {"RNT": 35, "ANDL": 10, "PG": "P", "depth": 65, "ml-RNT": 35, "ml-ANDL": 4}, {"RNT": 33, "ANDL": 7, "PG": "P", "depth": 70, "ml-RNT": 33, "ml-ANDL": 2}, {"RNT": 30, "ANDL": 5, "PG": "P", "depth": 75, "ml-RNT": 30, "ml-ANDL": 0}, {"RNT": 28, "ANDL": 2, "PG": "P", "depth": 80, "ml-RNT": 28, "ml-ANDL": 0}, {"RNT": 26, "ANDL": 0, "PG": "P", "depth": 85, "ml-ANDL": 0}, {"RNT": 24, "ANDL": 0, "PG": "P", "depth": 90, "ml-ANDL": 0}, {"RNT": 22, "ANDL": 0, "PG": "P", "depth": 95, "ml-ANDL": 0}], 
// "Q": [ {"RNT": 92, "ANDL": 113, "PG": "Q", "depth": 35, "ml-RNT": 92, "ml-ANDL": 98}, {"RNT": 74, "ANDL": 66, "PG": "Q", "depth": 40, "ml-RNT": 74, "ml-ANDL": 53}, {"RNT": 61, "ANDL": 39, "PG": "Q", "depth": 45, "ml-RNT": 61, "ml-ANDL": 29}, {"RNT": 53, "ANDL": 27, "PG": "Q", "depth": 50, "ml-RNT": 53, "ml-ANDL": 17}, {"RNT": 46, "ANDL": 19, "PG": "Q", "depth": 55, "ml-RNT": 46, "ml-ANDL": 9}, {"RNT": 42, "ANDL": 13, "PG": "Q", "depth": 60, "ml-RNT": 42, "ml-ANDL": 4}, {"RNT": 37, "ANDL": 8, "PG": "Q", "depth": 65, "ml-RNT": 37, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 6, "PG": "Q", "depth": 70, "ml-RNT": 35, "ml-ANDL": 0}, {"RNT": 31, "ANDL": 4, "PG": "Q", "depth": 75, "ml-RNT": 31, "ml-ANDL": 0}, {"RNT": 29, "ANDL": 0, "PG": "Q", "depth": 80, "ml-ANDL": 0}, {"RNT": 27, "ANDL": 0, "PG": "Q", "depth": 85, "ml-ANDL": 0}, {"RNT": 25, "ANDL": 0, "PG": "Q", "depth": 90, "ml-ANDL": 0}], 
// "R": [ {"RNT": 100, "ANDL": 105, "PG": "R", "depth": 35, "ml-RNT": 100, "ml-ANDL": 90}, {"RNT": 79, "ANDL": 61, "PG": "R", "depth": 40, "ml-RNT": 79, "ml-ANDL": 48}, {"RNT": 66, "ANDL": 34, "PG": "R", "depth": 45, "ml-RNT": 66, "ml-ANDL": 24}, {"RNT": 57, "ANDL": 23, "PG": "R", "depth": 50, "ml-RNT": 57, "ml-ANDL": 13}, {"RNT": 49, "ANDL": 16, "PG": "R", "depth": 55, "ml-RNT": 49, "ml-ANDL": 6}, {"RNT": 44, "ANDL": 11, "PG": "R", "depth": 60, "ml-RNT": 44, "ml-ANDL": 2}, {"RNT": 39, "ANDL": 6, "PG": "R", "depth": 65, "ml-RNT": 39, "ml-ANDL": 0}, {"RNT": 36, "ANDL": 4, "PG": "R", "depth": 70, "ml-ANDL": 0}, {"RNT": 33, "ANDL": 2, "PG": "R", "depth": 75, "ml-ANDL": 0}, {"RNT": 30, "ANDL": 0, "PG": "R", "depth": 80, "ml-ANDL": 0}], 
// "S": [ {"RNT": 108, "ANDL": 97, "PG": "S", "depth": 35, "ml-RNT": 108, "ml-ANDL": 82}, {"RNT": 85, "ANDL": 55, "PG": "S", "depth": 40, "ml-RNT": 85, "ml-ANDL": 42}, {"RNT": 70, "ANDL": 30, "PG": "S", "depth": 45, "ml-RNT": 70, "ml-ANDL": 20}, {"RNT": 60, "ANDL": 20, "PG": "S", "depth": 50, "ml-RNT": 60, "ml-ANDL": 10}, {"RNT": 52, "ANDL": 13, "PG": "S", "depth": 55, "ml-RNT": 52, "ml-ANDL": 3}, {"RNT": 47, "ANDL": 8, "PG": "S", "depth": 60, "ml-RNT": 46, "ml-ANDL": 0}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 65}, {"RNT": 38, "ANDL": 2, "PG": "S", "depth": 70}, {"RNT": 35, "ANDL": 0, "PG": "S", "depth": 75}], 
// "T": [ {"RNT": 117, "ANDL": 88, "PG": "T", "depth": 35, "ml-RNT": 117, "ml-ANDL": 73}, {"RNT": 91, "ANDL": 49, "PG": "T", "depth": 40, "ml-RNT": 91, "ml-ANDL": 36}, {"RNT": 74, "ANDL": 26, "PG": "T", "depth": 45, "ml-RNT": 74, "ml-ANDL": 16}, {"RNT": 63, "ANDL": 17, "PG": "T", "depth": 50, "ml-RNT": 63, "ml-ANDL": 7}, {"RNT": 55, "ANDL": 10, "PG": "T", "depth": 55, "ml-RNT": 55, "ml-ANDL": 0}, {"RNT": 49, "ANDL": 6, "PG": "T", "depth": 60, "ml-ANDL": 0}, {"RNT": 43, "ANDL": 2, "PG": "T", "depth": 65, "ml-ANDL": 0}, {"RNT": 40, "ANDL": 0, "PG": "T", "depth": 70, "ml-ANDL": 0}], 
// "U": [ {"RNT": 127, "ANDL": 78, "PG": "U", "depth": 35, "ml-RNT": 127, "ml-ANDL": 63}, {"RNT": 97, "ANDL": 43, "PG": "U", "depth": 40, "ml-RNT": 97, "ml-ANDL": 30}, {"RNT": 79, "ANDL": 21, "PG": "U", "depth": 45, "ml-RNT": 79, "ml-ANDL": 11}, {"RNT": 67, "ANDL": 13, "PG": "U", "depth": 50, "ml-RNT": 67, "ml-ANDL": 3}, {"RNT": 58, "ANDL": 7, "PG": "U", "depth": 55, "ml-ANDL": 0}, {"RNT": 52, "ANDL": 3, "PG": "U", "depth": 60, "ml-ANDL": 0}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 65, "ml-ANDL": 0}], 
// "V": [ {"RNT": 139, "ANDL": 66, "PG": "V", "depth": 35, "ml-RNT": 139, "ml-ANDL": 51}, {"RNT": 104, "ANDL": 36, "PG": "V", "depth": 40, "ml-RNT": 104, "ml-ANDL": 23}, {"RNT": 84, "ANDL": 16, "PG": "V", "depth": 45, "ml-RNT": 84, "ml-ANDL": 6}, {"RNT": 71, "ANDL": 9, "PG": "V", "depth": 50, "ml-RNT": 70, "ml-ANDL": 0}, {"RNT": 61, "ANDL": 4, "PG": "V", "depth": 55, "ml-ANDL": 0}, {"RNT": 54, "ANDL": 1, "PG": "V", "depth": 60, "ml-ANDL": 0}], 
// "W": [ {"RNT": 152, "ANDL": 53, "PG": "W", "depth": 35, "ml-RNT": 152, "ml-ANDL": 38}, {"RNT": 111, "ANDL": 29, "PG": "W", "depth": 40, "ml-RNT": 111, "ml-ANDL": 16}, {"RNT": 89, "ANDL": 11, "PG": "W", "depth": 45, "ml-RNT": 89, "ml-ANDL": 0}, {"RNT": 75, "ANDL": 5, "PG": "W", "depth": 50, "ml-ANDL": 0}, {"RNT": 65, "ANDL": 0, "PG": "W", "depth": 55, "ml-ANDL": 0}, {"RNT": 55, "ANDL": 0, "PG": "W", "depth": 60, "ml-ANDL": 0}], 
// "X": [ {"RNT": 168, "ANDL": 37, "PG": "X", "depth": 35, "ml-RNT": 168, "ml-ANDL": 22}, {"RNT": 120, "ANDL": 20, "PG": "X", "depth": 40, "ml-RNT": 120, "ml-ANDL": 7}, {"RNT": 95, "ANDL": 5, "PG": "X", "depth": 45, "ml-RNT": 90, "ml-ANDL": 0}, {"RNT": 80, "ANDL": 0, "PG": "X", "depth": 50, "ml-ANDL": 0}], 
// "Y": [ {"RNT": 188, "ANDL": 17, "PG": "Y", "depth": 35, "ml-RNT": 190, "ml-ANDL": 0}, {"RNT": 129, "ANDL": 11, "PG": "Y", "depth": 40, "ml-RNT": 127, "ml-ANDL": 0}, {"RNT": 97, "ANDL": 3, "PG": "Y", "depth": 45, "ml-ANDL": 0}], 
// "Z": [ {"RNT": 205, "ANDL": 0, "PG": "Z", "depth": 35, "ml-ANDL": 0}, {"RNT": 140, "ANDL": 0, "PG": "Z", "depth": 40, "ml-ANDL": 0}, {"RNT": 100, "ANDL": 0, "PG": "Z", "depth": 45, "ml-ANDL": 0}]}
 
RDTableFT = //[LMNT 20141208]: Auto populated table created with new engine
{
"A": [ {"RNT": 10, "ANDL": 195, "PG": "A", "depth": 35, "ml-RNT": 10, "ml-ANDL": 180}, {"RNT": 9, "ANDL": 131, "PG": "A", "depth": 40, "ml-RNT": 9, "ml-ANDL": 118}, {"RNT": 8, "ANDL": 92, "PG": "A", "depth": 45, "ml-RNT": 8, "ml-ANDL": 82}, {"RNT": 7, "ANDL": 73, "PG": "A", "depth": 50, "ml-RNT": 7, "ml-ANDL": 63}, {"RNT": 6, "ANDL": 59, "PG": "A", "depth": 55, "ml-RNT": 6, "ml-ANDL": 49}, {"RNT": 6, "ANDL": 49, "PG": "A", "depth": 60, "ml-RNT": 6, "ml-ANDL": 40}, {"RNT": 5, "ANDL": 40, "PG": "A", "depth": 65, "ml-RNT": 5, "ml-ANDL": 34}, {"RNT": 5, "ANDL": 35, "PG": "A", "depth": 70, "ml-RNT": 5, "ml-ANDL": 30}, {"RNT": 4, "ANDL": 31, "PG": "A", "depth": 75, "ml-RNT": 4, "ml-ANDL": 27}, {"RNT": 4, "ANDL": 26, "PG": "A", "depth": 80, "ml-RNT": 4, "ml-ANDL": 24}, {"RNT": 4, "ANDL": 23, "PG": "A", "depth": 85, "ml-RNT": 4, "ml-ANDL": 23}, {"RNT": 4, "ANDL": 21, "PG": "A", "depth": 90, "ml-RNT": 4, "ml-ANDL": 21}, {"RNT": 3, "ANDL": 19, "PG": "A", "depth": 95, "ml-RNT": 3, "ml-ANDL": 19}, {"RNT": 3, "ANDL": 17, "PG": "A", "depth": 100, "ml-RNT": 3, "ml-ANDL": 17}, {"RNT": 3, "ANDL": 13, "PG": "A", "depth": 110, "ml-RNT": 3, "ml-ANDL": 13}, {"RNT": 3, "ANDL": 10, "PG": "A", "depth": 120, "ml-RNT": 3, "ml-ANDL": 10}, {"RNT": 3, "ANDL": 7, "PG": "A", "depth": 130, "ml-RNT": 3, "ml-ANDL": 7}],
"B": [ {"RNT": 19, "ANDL": 186, "PG": "B", "depth": 35, "ml-RNT": 19, "ml-ANDL": 171}, {"RNT": 16, "ANDL": 124, "PG": "B", "depth": 40, "ml-RNT": 16, "ml-ANDL": 111}, {"RNT": 14, "ANDL": 86, "PG": "B", "depth": 45, "ml-RNT": 14, "ml-ANDL": 76}, {"RNT": 13, "ANDL": 67, "PG": "B", "depth": 50, "ml-RNT": 13, "ml-ANDL": 57}, {"RNT": 11, "ANDL": 54, "PG": "B", "depth": 55, "ml-RNT": 11, "ml-ANDL": 44}, {"RNT": 11, "ANDL": 44, "PG": "B", "depth": 60, "ml-RNT": 11, "ml-ANDL": 35}, {"RNT": 9, "ANDL": 36, "PG": "B", "depth": 65, "ml-RNT": 9, "ml-ANDL": 30}, {"RNT": 9, "ANDL": 31, "PG": "B", "depth": 70, "ml-RNT": 9, "ml-ANDL": 26}, {"RNT": 8, "ANDL": 27, "PG": "B", "depth": 75, "ml-RNT": 8, "ml-ANDL": 23}, {"RNT": 8, "ANDL": 22, "PG": "B", "depth": 80, "ml-RNT": 7, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 20, "PG": "B", "depth": 85, "ml-RNT": 7, "ml-ANDL": 20}, {"RNT": 7, "ANDL": 18, "PG": "B", "depth": 90, "ml-RNT": 7, "ml-ANDL": 18}, {"RNT": 6, "ANDL": 16, "PG": "B", "depth": 95, "ml-RNT": 6, "ml-ANDL": 16}, {"RNT": 6, "ANDL": 14, "PG": "B", "depth": 100, "ml-RNT": 6, "ml-ANDL": 14}, {"RNT": 6, "ANDL": 10, "PG": "B", "depth": 110, "ml-RNT": 6, "ml-ANDL": 10}, {"RNT": 5, "ANDL": 8, "PG": "B", "depth": 120, "ml-RNT": 5, "ml-ANDL": 8}, {"RNT": 5, "ANDL": 5, "PG": "B", "depth": 130, "ml-RNT": 5, "ml-ANDL": 5}],
"C": [ {"RNT": 25, "ANDL": 180, "PG": "C", "depth": 35, "ml-RNT": 25, "ml-ANDL": 165}, {"RNT": 22, "ANDL": 118, "PG": "C", "depth": 40, "ml-RNT": 22, "ml-ANDL": 105}, {"RNT": 19, "ANDL": 81, "PG": "C", "depth": 45, "ml-RNT": 19, "ml-ANDL": 71}, {"RNT": 17, "ANDL": 63, "PG": "C", "depth": 50, "ml-RNT": 17, "ml-ANDL": 53}, {"RNT": 15, "ANDL": 50, "PG": "C", "depth": 55, "ml-RNT": 15, "ml-ANDL": 40}, {"RNT": 14, "ANDL": 41, "PG": "C", "depth": 60, "ml-RNT": 14, "ml-ANDL": 32}, {"RNT": 12, "ANDL": 33, "PG": "C", "depth": 65, "ml-RNT": 12, "ml-ANDL": 27}, {"RNT": 12, "ANDL": 28, "PG": "C", "depth": 70, "ml-RNT": 12, "ml-ANDL": 23}, {"RNT": 11, "ANDL": 24, "PG": "C", "depth": 75, "ml-RNT": 11, "ml-ANDL": 20}, {"RNT": 10, "ANDL": 20, "PG": "C", "depth": 80, "ml-RNT": 10, "ml-ANDL": 18}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 85, "ml-RNT": 9, "ml-ANDL": 16}, {"RNT": 9, "ANDL": 16, "PG": "C", "depth": 90, "ml-RNT": 9, "ml-ANDL": 16}, {"RNT": 8, "ANDL": 14, "PG": "C", "depth": 95, "ml-RNT": 8, "ml-ANDL": 14}, {"RNT": 8, "ANDL": 12, "PG": "C", "depth": 100, "ml-RNT": 8, "ml-ANDL": 12}, {"RNT": 7, "ANDL": 9, "PG": "C", "depth": 110, "ml-RNT": 7, "ml-ANDL": 9}, {"RNT": 6, "ANDL": 7, "PG": "C", "depth": 120, "ml-RNT": 6, "ml-ANDL": 7}, {"RNT": 6, "ANDL": 4, "PG": "C", "depth": 130, "ml-RNT": 6, "ml-ANDL": 4}],
"D": [ {"RNT": 29, "ANDL": 176, "PG": "D", "depth": 35, "ml-RNT": 29, "ml-ANDL": 161}, {"RNT": 25, "ANDL": 115, "PG": "D", "depth": 40, "ml-RNT": 25, "ml-ANDL": 102}, {"RNT": 21, "ANDL": 79, "PG": "D", "depth": 45, "ml-RNT": 21, "ml-ANDL": 69}, {"RNT": 19, "ANDL": 61, "PG": "D", "depth": 50, "ml-RNT": 19, "ml-ANDL": 51}, {"RNT": 17, "ANDL": 48, "PG": "D", "depth": 55, "ml-RNT": 17, "ml-ANDL": 38}, {"RNT": 16, "ANDL": 39, "PG": "D", "depth": 60, "ml-RNT": 16, "ml-ANDL": 30}, {"RNT": 14, "ANDL": 31, "PG": "D", "depth": 65, "ml-RNT": 14, "ml-ANDL": 25}, {"RNT": 13, "ANDL": 27, "PG": "D", "depth": 70, "ml-RNT": 13, "ml-ANDL": 22}, {"RNT": 12, "ANDL": 23, "PG": "D", "depth": 75, "ml-RNT": 12, "ml-ANDL": 19}, {"RNT": 11, "ANDL": 19, "PG": "D", "depth": 80, "ml-RNT": 11, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 17, "PG": "D", "depth": 85, "ml-RNT": 10, "ml-ANDL": 17}, {"RNT": 10, "ANDL": 15, "PG": "D", "depth": 90, "ml-RNT": 10, "ml-ANDL": 15}, {"RNT": 9, "ANDL": 13, "PG": "D", "depth": 95, "ml-RNT": 9, "ml-ANDL": 13}, {"RNT": 9, "ANDL": 11, "PG": "D", "depth": 100, "ml-RNT": 9, "ml-ANDL": 11}, {"RNT": 8, "ANDL": 8, "PG": "D", "depth": 110, "ml-RNT": 8, "ml-ANDL": 8}, {"RNT": 7, "ANDL": 6, "PG": "D", "depth": 120, "ml-RNT": 7, "ml-ANDL": 6}, {"RNT": 7, "ANDL": 3, "PG": "D", "depth": 130, "ml-RNT": 7, "ml-ANDL": 3}],
"E": [ {"RNT": 32, "ANDL": 173, "PG": "E", "depth": 35, "ml-RNT": 32, "ml-ANDL": 158}, {"RNT": 27, "ANDL": 113, "PG": "E", "depth": 40, "ml-RNT": 27, "ml-ANDL": 100}, {"RNT": 24, "ANDL": 76, "PG": "E", "depth": 45, "ml-RNT": 24, "ml-ANDL": 66}, {"RNT": 21, "ANDL": 59, "PG": "E", "depth": 50, "ml-RNT": 21, "ml-ANDL": 49}, {"RNT": 19, "ANDL": 46, "PG": "E", "depth": 55, "ml-RNT": 19, "ml-ANDL": 36}, {"RNT": 17, "ANDL": 38, "PG": "E", "depth": 60, "ml-RNT": 17, "ml-ANDL": 29}, {"RNT": 16, "ANDL": 29, "PG": "E", "depth": 65, "ml-RNT": 16, "ml-ANDL": 23}, {"RNT": 15, "ANDL": 25, "PG": "E", "depth": 70, "ml-RNT": 15, "ml-ANDL": 20}, {"RNT": 13, "ANDL": 22, "PG": "E", "depth": 75, "ml-RNT": 13, "ml-ANDL": 18}, {"RNT": 13, "ANDL": 17, "PG": "E", "depth": 80, "ml-RNT": 13, "ml-ANDL": 15}, {"RNT": 12, "ANDL": 15, "PG": "E", "depth": 85, "ml-RNT": 12, "ml-ANDL": 15}, {"RNT": 11, "ANDL": 14, "PG": "E", "depth": 90, "ml-RNT": 11, "ml-ANDL": 14}, {"RNT": 10, "ANDL": 12, "PG": "E", "depth": 95, "ml-RNT": 10, "ml-ANDL": 12}, {"RNT": 10, "ANDL": 10, "PG": "E", "depth": 100, "ml-RNT": 10, "ml-ANDL": 10}, {"RNT": 9, "ANDL": 7, "PG": "E", "depth": 110, "ml-RNT": 9, "ml-ANDL": 7}, {"RNT": 8, "ANDL": 5, "PG": "E", "depth": 120, "ml-RNT": 8, "ml-ANDL": 5}, {"RNT": 8, "ANDL": 0, "PG": "E", "depth": 130, "ml-RNT": 8, "ml-ANDL": 0}],
"F": [ {"RNT": 36, "ANDL": 169, "PG": "F", "depth": 35, "ml-RNT": 36, "ml-ANDL": 154}, {"RNT": 31, "ANDL": 109, "PG": "F", "depth": 40, "ml-RNT": 31, "ml-ANDL": 96}, {"RNT": 26, "ANDL": 74, "PG": "F", "depth": 45, "ml-RNT": 26, "ml-ANDL": 64}, {"RNT": 24, "ANDL": 56, "PG": "F", "depth": 50, "ml-RNT": 24, "ml-ANDL": 46}, {"RNT": 21, "ANDL": 44, "PG": "F", "depth": 55, "ml-RNT": 21, "ml-ANDL": 34}, {"RNT": 19, "ANDL": 36, "PG": "F", "depth": 60, "ml-RNT": 19, "ml-ANDL": 27}, {"RNT": 17, "ANDL": 28, "PG": "F", "depth": 65, "ml-RNT": 17, "ml-ANDL": 22}, {"RNT": 16, "ANDL": 24, "PG": "F", "depth": 70, "ml-RNT": 16, "ml-ANDL": 19}, {"RNT": 15, "ANDL": 20, "PG": "F", "depth": 75, "ml-RNT": 15, "ml-ANDL": 16}, {"RNT": 14, "ANDL": 16, "PG": "F", "depth": 80, "ml-RNT": 14, "ml-ANDL": 14}, {"RNT": 13, "ANDL": 14, "PG": "F", "depth": 85, "ml-RNT": 13, "ml-ANDL": 14}, {"RNT": 12, "ANDL": 13, "PG": "F", "depth": 90, "ml-RNT": 12, "ml-ANDL": 13}, {"RNT": 11, "ANDL": 11, "PG": "F", "depth": 95, "ml-RNT": 11, "ml-ANDL": 11}, {"RNT": 11, "ANDL": 9, "PG": "F", "depth": 100, "ml-RNT": 11, "ml-ANDL": 9}, {"RNT": 10, "ANDL": 6, "PG": "F", "depth": 110, "ml-RNT": 10, "ml-ANDL": 6}, {"RNT": 9, "ANDL": 4, "PG": "F", "depth": 120, "ml-RNT": 9, "ml-ANDL": 4}, {"RNT": 8, "ANDL": 0, "PG": "F", "depth": 130, "ml-RNT": 8, "ml-ANDL": 0}],
"G": [ {"RNT": 40, "ANDL": 165, "PG": "G", "depth": 35, "ml-RNT": 40, "ml-ANDL": 150}, {"RNT": 34, "ANDL": 106, "PG": "G", "depth": 40, "ml-RNT": 34, "ml-ANDL": 93}, {"RNT": 29, "ANDL": 71, "PG": "G", "depth": 45, "ml-RNT": 29, "ml-ANDL": 61}, {"RNT": 26, "ANDL": 54, "PG": "G", "depth": 50, "ml-RNT": 26, "ml-ANDL": 44}, {"RNT": 23, "ANDL": 42, "PG": "G", "depth": 55, "ml-RNT": 23, "ml-ANDL": 32}, {"RNT": 21, "ANDL": 34, "PG": "G", "depth": 60, "ml-RNT": 21, "ml-ANDL": 25}, {"RNT": 19, "ANDL": 26, "PG": "G", "depth": 65, "ml-RNT": 19, "ml-ANDL": 20}, {"RNT": 18, "ANDL": 22, "PG": "G", "depth": 70, "ml-RNT": 18, "ml-ANDL": 17}, {"RNT": 16, "ANDL": 19, "PG": "G", "depth": 75, "ml-RNT": 16, "ml-ANDL": 15}, {"RNT": 15, "ANDL": 15, "PG": "G", "depth": 80, "ml-RNT": 15, "ml-ANDL": 13}, {"RNT": 14, "ANDL": 13, "PG": "G", "depth": 85, "ml-RNT": 14, "ml-ANDL": 13}, {"RNT": 13, "ANDL": 12, "PG": "G", "depth": 90, "ml-RNT": 13, "ml-ANDL": 12}, {"RNT": 12, "ANDL": 10, "PG": "G", "depth": 95, "ml-RNT": 12, "ml-ANDL": 10}, {"RNT": 12, "ANDL": 8, "PG": "G", "depth": 100, "ml-RNT": 12, "ml-ANDL": 8}, {"RNT": 11, "ANDL": 5, "PG": "G", "depth": 110, "ml-RNT": 11, "ml-ANDL": 5}, {"RNT": 10, "ANDL": 3, "PG": "G", "depth": 120, "ml-RNT": 10, "ml-ANDL": 3}, {"RNT": 9, "ANDL": 0, "PG": "G", "depth": 130, "ml-RNT": 9, "ml-ANDL": 0}],
"H": [ {"RNT": 44, "ANDL": 161, "PG": "H", "depth": 35, "ml-RNT": 44, "ml-ANDL": 146}, {"RNT": 37, "ANDL": 103, "PG": "H", "depth": 40, "ml-RNT": 37, "ml-ANDL": 90}, {"RNT": 32, "ANDL": 68, "PG": "H", "depth": 45, "ml-RNT": 32, "ml-ANDL": 58}, {"RNT": 28, "ANDL": 52, "PG": "H", "depth": 50, "ml-RNT": 28, "ml-ANDL": 42}, {"RNT": 25, "ANDL": 40, "PG": "H", "depth": 55, "ml-RNT": 25, "ml-ANDL": 30}, {"RNT": 23, "ANDL": 32, "PG": "H", "depth": 60, "ml-RNT": 23, "ml-ANDL": 22}, {"RNT": 21, "ANDL": 24, "PG": "H", "depth": 65, "ml-RNT": 21, "ml-ANDL": 18}, {"RNT": 19, "ANDL": 21, "PG": "H", "depth": 70, "ml-RNT": 19, "ml-ANDL": 16}, {"RNT": 17, "ANDL": 18, "PG": "H", "depth": 75, "ml-RNT": 17, "ml-ANDL": 14}, {"RNT": 17, "ANDL": 13, "PG": "H", "depth": 80, "ml-RNT": 17, "ml-ANDL": 11}, {"RNT": 15, "ANDL": 12, "PG": "H", "depth": 85, "ml-RNT": 15, "ml-ANDL": 12}, {"RNT": 15, "ANDL": 10, "PG": "H", "depth": 90, "ml-RNT": 15, "ml-ANDL": 10}, {"RNT": 13, "ANDL": 9, "PG": "H", "depth": 95, "ml-RNT": 13, "ml-ANDL": 9}, {"RNT": 13, "ANDL": 7, "PG": "H", "depth": 100, "ml-RNT": 13, "ml-ANDL": 7}, {"RNT": 12, "ANDL": 4, "PG": "H", "depth": 110, "ml-RNT": 12, "ml-ANDL": 4}, {"RNT": 11, "ANDL": 2, "PG": "H", "depth": 120, "ml-RNT": 11, "ml-ANDL": 2}, {"RNT": 10, "ANDL": 0, "PG": "H", "depth": 130, "ml-RNT": 10, "ml-ANDL": 0}],
"I": [ {"RNT": 48, "ANDL": 157, "PG": "I", "depth": 35, "ml-RNT": 48, "ml-ANDL": 142}, {"RNT": 40, "ANDL": 100, "PG": "I", "depth": 40, "ml-RNT": 40, "ml-ANDL": 87}, {"RNT": 35, "ANDL": 65, "PG": "I", "depth": 45, "ml-RNT": 35, "ml-ANDL": 55}, {"RNT": 31, "ANDL": 49, "PG": "I", "depth": 50, "ml-RNT": 31, "ml-ANDL": 39}, {"RNT": 27, "ANDL": 38, "PG": "I", "depth": 55, "ml-RNT": 27, "ml-ANDL": 28}, {"RNT": 25, "ANDL": 30, "PG": "I", "depth": 60, "ml-RNT": 25, "ml-ANDL": 21}, {"RNT": 22, "ANDL": 23, "PG": "I", "depth": 65, "ml-RNT": 22, "ml-ANDL": 17}, {"RNT": 21, "ANDL": 19, "PG": "I", "depth": 70, "ml-RNT": 21, "ml-ANDL": 14}, {"RNT": 19, "ANDL": 16, "PG": "I", "depth": 75, "ml-RNT": 19, "ml-ANDL": 12}, {"RNT": 18, "ANDL": 12, "PG": "I", "depth": 80, "ml-RNT": 18, "ml-ANDL": 10}, {"RNT": 16, "ANDL": 11, "PG": "I", "depth": 85, "ml-RNT": 16, "ml-ANDL": 11}, {"RNT": 16, "ANDL": 9, "PG": "I", "depth": 90, "ml-RNT": 16, "ml-ANDL": 9}, {"RNT": 14, "ANDL": 8, "PG": "I", "depth": 95, "ml-RNT": 14, "ml-ANDL": 8}, {"RNT": 14, "ANDL": 6, "PG": "I", "depth": 100, "ml-RNT": 14, "ml-ANDL": 6}, {"RNT": 13, "ANDL": 3, "PG": "I", "depth": 110, "ml-RNT": 13, "ml-ANDL": 3}, {"RNT": 12, "ANDL": 0, "PG": "I", "depth": 120, "ml-RNT": 12, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "I", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"J": [ {"RNT": 52, "ANDL": 153, "PG": "J", "depth": 35, "ml-RNT": 52, "ml-ANDL": 138}, {"RNT": 44, "ANDL": 96, "PG": "J", "depth": 40, "ml-RNT": 44, "ml-ANDL": 83}, {"RNT": 38, "ANDL": 62, "PG": "J", "depth": 45, "ml-RNT": 38, "ml-ANDL": 52}, {"RNT": 33, "ANDL": 47, "PG": "J", "depth": 50, "ml-RNT": 33, "ml-ANDL": 37}, {"RNT": 29, "ANDL": 36, "PG": "J", "depth": 55, "ml-RNT": 29, "ml-ANDL": 26}, {"RNT": 27, "ANDL": 28, "PG": "J", "depth": 60, "ml-RNT": 27, "ml-ANDL": 19}, {"RNT": 24, "ANDL": 21, "PG": "J", "depth": 65, "ml-RNT": 24, "ml-ANDL": 15}, {"RNT": 22, "ANDL": 18, "PG": "J", "depth": 70, "ml-RNT": 22, "ml-ANDL": 13}, {"RNT": 20, "ANDL": 15, "PG": "J", "depth": 75, "ml-RNT": 20, "ml-ANDL": 11}, {"RNT": 19, "ANDL": 11, "PG": "J", "depth": 80, "ml-RNT": 19, "ml-ANDL": 9}, {"RNT": 18, "ANDL": 9, "PG": "J", "depth": 85, "ml-RNT": 18, "ml-ANDL": 9}, {"RNT": 17, "ANDL": 8, "PG": "J", "depth": 90, "ml-RNT": 17, "ml-ANDL": 8}, {"RNT": 15, "ANDL": 7, "PG": "J", "depth": 95, "ml-RNT": 15, "ml-ANDL": 7}, {"RNT": 15, "ANDL": 5, "PG": "J", "depth": 100, "ml-RNT": 15, "ml-ANDL": 5}, {"RNT": 14, "ANDL": 2, "PG": "J", "depth": 110, "ml-RNT": 14, "ml-ANDL": 2}, {"RNT": 12, "ANDL": 0, "PG": "J", "depth": 120, "ml-RNT": 12, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "J", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"K": [ {"RNT": 57, "ANDL": 148, "PG": "K", "depth": 35, "ml-RNT": 57, "ml-ANDL": 133}, {"RNT": 48, "ANDL": 92, "PG": "K", "depth": 40, "ml-RNT": 48, "ml-ANDL": 79}, {"RNT": 41, "ANDL": 59, "PG": "K", "depth": 45, "ml-RNT": 41, "ml-ANDL": 49}, {"RNT": 36, "ANDL": 44, "PG": "K", "depth": 50, "ml-RNT": 36, "ml-ANDL": 34}, {"RNT": 32, "ANDL": 33, "PG": "K", "depth": 55, "ml-RNT": 32, "ml-ANDL": 23}, {"RNT": 29, "ANDL": 26, "PG": "K", "depth": 60, "ml-RNT": 29, "ml-ANDL": 17}, {"RNT": 26, "ANDL": 19, "PG": "K", "depth": 65, "ml-RNT": 26, "ml-ANDL": 13}, {"RNT": 24, "ANDL": 16, "PG": "K", "depth": 70, "ml-RNT": 24, "ml-ANDL": 11}, {"RNT": 22, "ANDL": 13, "PG": "K", "depth": 75, "ml-RNT": 22, "ml-ANDL": 9}, {"RNT": 21, "ANDL": 9, "PG": "K", "depth": 80, "ml-RNT": 21, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 8, "PG": "K", "depth": 85, "ml-RNT": 19, "ml-ANDL": 8}, {"RNT": 18, "ANDL": 7, "PG": "K", "depth": 90, "ml-RNT": 18, "ml-ANDL": 7}, {"RNT": 17, "ANDL": 5, "PG": "K", "depth": 95, "ml-RNT": 17, "ml-ANDL": 5}, {"RNT": 16, "ANDL": 4, "PG": "K", "depth": 100, "ml-RNT": 16, "ml-ANDL": 4}, {"RNT": 14, "ANDL": 2, "PG": "K", "depth": 110, "ml-RNT": 14, "ml-ANDL": 2}, {"RNT": 13, "ANDL": 0, "PG": "K", "depth": 120, "ml-RNT": 13, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "K", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"L": [ {"RNT": 62, "ANDL": 143, "PG": "L", "depth": 35, "ml-RNT": 62, "ml-ANDL": 128}, {"RNT": 51, "ANDL": 89, "PG": "L", "depth": 40, "ml-RNT": 51, "ml-ANDL": 76}, {"RNT": 44, "ANDL": 56, "PG": "L", "depth": 45, "ml-RNT": 44, "ml-ANDL": 46}, {"RNT": 38, "ANDL": 42, "PG": "L", "depth": 50, "ml-RNT": 38, "ml-ANDL": 32}, {"RNT": 34, "ANDL": 31, "PG": "L", "depth": 55, "ml-RNT": 34, "ml-ANDL": 21}, {"RNT": 31, "ANDL": 24, "PG": "L", "depth": 60, "ml-RNT": 31, "ml-ANDL": 15}, {"RNT": 28, "ANDL": 17, "PG": "L", "depth": 65, "ml-RNT": 28, "ml-ANDL": 11}, {"RNT": 26, "ANDL": 14, "PG": "L", "depth": 70, "ml-RNT": 26, "ml-ANDL": 9}, {"RNT": 23, "ANDL": 12, "PG": "L", "depth": 75, "ml-RNT": 23, "ml-ANDL": 8}, {"RNT": 22, "ANDL": 8, "PG": "L", "depth": 80, "ml-RNT": 22, "ml-ANDL": 6}, {"RNT": 20, "ANDL": 7, "PG": "L", "depth": 85, "ml-RNT": 20, "ml-ANDL": 7}, {"RNT": 19, "ANDL": 6, "PG": "L", "depth": 90, "ml-RNT": 19, "ml-ANDL": 6}, {"RNT": 18, "ANDL": 4, "PG": "L", "depth": 95, "ml-RNT": 18, "ml-ANDL": 4}, {"RNT": 17, "ANDL": 3, "PG": "L", "depth": 100, "ml-RNT": 17, "ml-ANDL": 3}, {"RNT": 15, "ANDL": 0, "PG": "L", "depth": 110, "ml-RNT": 15, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "L", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "L", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"M": [ {"RNT": 67, "ANDL": 138, "PG": "M", "depth": 35, "ml-RNT": 67, "ml-ANDL": 123}, {"RNT": 55, "ANDL": 85, "PG": "M", "depth": 40, "ml-RNT": 55, "ml-ANDL": 72}, {"RNT": 47, "ANDL": 53, "PG": "M", "depth": 45, "ml-RNT": 47, "ml-ANDL": 43}, {"RNT": 41, "ANDL": 39, "PG": "M", "depth": 50, "ml-RNT": 41, "ml-ANDL": 29}, {"RNT": 36, "ANDL": 29, "PG": "M", "depth": 55, "ml-RNT": 36, "ml-ANDL": 19}, {"RNT": 33, "ANDL": 22, "PG": "M", "depth": 60, "ml-RNT": 33, "ml-ANDL": 13}, {"RNT": 29, "ANDL": 16, "PG": "M", "depth": 65, "ml-RNT": 29, "ml-ANDL": 10}, {"RNT": 27, "ANDL": 13, "PG": "M", "depth": 70, "ml-RNT": 27, "ml-ANDL": 8}, {"RNT": 25, "ANDL": 10, "PG": "M", "depth": 75, "ml-RNT": 25, "ml-ANDL": 6}, {"RNT": 23, "ANDL": 7, "PG": "M", "depth": 80, "ml-RNT": 23, "ml-ANDL": 5}, {"RNT": 21, "ANDL": 6, "PG": "M", "depth": 85, "ml-RNT": 21, "ml-ANDL": 6}, {"RNT": 21, "ANDL": 4, "PG": "M", "depth": 90, "ml-RNT": 21, "ml-ANDL": 4}, {"RNT": 19, "ANDL": 3, "PG": "M", "depth": 95, "ml-RNT": 19, "ml-ANDL": 3}, {"RNT": 18, "ANDL": 2, "PG": "M", "depth": 100, "ml-RNT": 18, "ml-ANDL": 2}, {"RNT": 16, "ANDL": 0, "PG": "M", "depth": 110, "ml-RNT": 16, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "M", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"N": [ {"RNT": 73, "ANDL": 132, "PG": "N", "depth": 35, "ml-RNT": 73, "ml-ANDL": 117}, {"RNT": 60, "ANDL": 80, "PG": "N", "depth": 40, "ml-RNT": 60, "ml-ANDL": 67}, {"RNT": 50, "ANDL": 50, "PG": "N", "depth": 45, "ml-RNT": 50, "ml-ANDL": 40}, {"RNT": 44, "ANDL": 36, "PG": "N", "depth": 50, "ml-RNT": 44, "ml-ANDL": 26}, {"RNT": 38, "ANDL": 27, "PG": "N", "depth": 55, "ml-RNT": 38, "ml-ANDL": 17}, {"RNT": 35, "ANDL": 20, "PG": "N", "depth": 60, "ml-RNT": 35, "ml-ANDL": 11}, {"RNT": 31, "ANDL": 14, "PG": "N", "depth": 65, "ml-RNT": 31, "ml-ANDL": 8}, {"RNT": 29, "ANDL": 11, "PG": "N", "depth": 70, "ml-RNT": 29, "ml-ANDL": 6}, {"RNT": 26, "ANDL": 9, "PG": "N", "depth": 75, "ml-RNT": 26, "ml-ANDL": 5}, {"RNT": 25, "ANDL": 5, "PG": "N", "depth": 80, "ml-RNT": 25, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 4, "PG": "N", "depth": 85, "ml-RNT": 23, "ml-ANDL": 4}, {"RNT": 22, "ANDL": 3, "PG": "N", "depth": 90, "ml-RNT": 22, "ml-ANDL": 3}, {"RNT": 20, "ANDL": 2, "PG": "N", "depth": 95, "ml-RNT": 20, "ml-ANDL": 2}, {"RNT": 19, "ANDL": 0, "PG": "N", "depth": 100, "ml-RNT": 19, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "N", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"O": [ {"RNT": 79, "ANDL": 126, "PG": "O", "depth": 35, "ml-RNT": 79, "ml-ANDL": 111}, {"RNT": 64, "ANDL": 76, "PG": "O", "depth": 40, "ml-RNT": 64, "ml-ANDL": 63}, {"RNT": 54, "ANDL": 46, "PG": "O", "depth": 45, "ml-RNT": 54, "ml-ANDL": 36}, {"RNT": 47, "ANDL": 33, "PG": "O", "depth": 50, "ml-RNT": 47, "ml-ANDL": 23}, {"RNT": 41, "ANDL": 24, "PG": "O", "depth": 55, "ml-RNT": 41, "ml-ANDL": 14}, {"RNT": 37, "ANDL": 18, "PG": "O", "depth": 60, "ml-RNT": 37, "ml-ANDL": 9}, {"RNT": 33, "ANDL": 12, "PG": "O", "depth": 65, "ml-RNT": 33, "ml-ANDL": 6}, {"RNT": 31, "ANDL": 9, "PG": "O", "depth": 70, "ml-RNT": 31, "ml-ANDL": 4}, {"RNT": 28, "ANDL": 7, "PG": "O", "depth": 75, "ml-RNT": 28, "ml-ANDL": 3}, {"RNT": 26, "ANDL": 4, "PG": "O", "depth": 80, "ml-RNT": 26, "ml-ANDL": 2}, {"RNT": 24, "ANDL": 3, "PG": "O", "depth": 85, "ml-RNT": 24, "ml-ANDL": 3}, {"RNT": 23, "ANDL": 2, "PG": "O", "depth": 90, "ml-RNT": 23, "ml-ANDL": 2}, {"RNT": 21, "ANDL": 0, "PG": "O", "depth": 95, "ml-RNT": 21, "ml-ANDL": 0}, {"RNT": 20, "ANDL": 0, "PG": "O", "depth": 100, "ml-RNT": 20, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "O", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"P": [ {"RNT": 85, "ANDL": 120, "PG": "P", "depth": 35, "ml-RNT": 85, "ml-ANDL": 105}, {"RNT": 69, "ANDL": 71, "PG": "P", "depth": 40, "ml-RNT": 69, "ml-ANDL": 58}, {"RNT": 58, "ANDL": 42, "PG": "P", "depth": 45, "ml-RNT": 58, "ml-ANDL": 32}, {"RNT": 50, "ANDL": 30, "PG": "P", "depth": 50, "ml-RNT": 50, "ml-ANDL": 20}, {"RNT": 44, "ANDL": 21, "PG": "P", "depth": 55, "ml-RNT": 44, "ml-ANDL": 11}, {"RNT": 39, "ANDL": 16, "PG": "P", "depth": 60, "ml-RNT": 39, "ml-ANDL": 7}, {"RNT": 35, "ANDL": 10, "PG": "P", "depth": 65, "ml-RNT": 35, "ml-ANDL": 4}, {"RNT": 33, "ANDL": 7, "PG": "P", "depth": 70, "ml-RNT": 33, "ml-ANDL": 2}, {"RNT": 30, "ANDL": 5, "PG": "P", "depth": 75, "ml-RNT": 30, "ml-ANDL": 0}, {"RNT": 28, "ANDL": 2, "PG": "P", "depth": 80, "ml-RNT": 28, "ml-ANDL": 0}, {"RNT": 26, "ANDL": 0, "PG": "P", "depth": 85, "ml-RNT": 26, "ml-ANDL": 0}, {"RNT": 24, "ANDL": 0, "PG": "P", "depth": 90, "ml-RNT": 24, "ml-ANDL": 0}, {"RNT": 22, "ANDL": 0, "PG": "P", "depth": 95, "ml-RNT": 22, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "P", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"Q": [ {"RNT": 92, "ANDL": 113, "PG": "Q", "depth": 35, "ml-RNT": 92, "ml-ANDL": 98}, {"RNT": 74, "ANDL": 66, "PG": "Q", "depth": 40, "ml-RNT": 74, "ml-ANDL": 53}, {"RNT": 61, "ANDL": 39, "PG": "Q", "depth": 45, "ml-RNT": 61, "ml-ANDL": 29}, {"RNT": 53, "ANDL": 27, "PG": "Q", "depth": 50, "ml-RNT": 53, "ml-ANDL": 17}, {"RNT": 46, "ANDL": 19, "PG": "Q", "depth": 55, "ml-RNT": 46, "ml-ANDL": 9}, {"RNT": 42, "ANDL": 13, "PG": "Q", "depth": 60, "ml-RNT": 42, "ml-ANDL": 4}, {"RNT": 37, "ANDL": 8, "PG": "Q", "depth": 65, "ml-RNT": 37, "ml-ANDL": 2}, {"RNT": 34, "ANDL": 6, "PG": "Q", "depth": 70, "ml-RNT": 35, "ml-ANDL": 0}, {"RNT": 31, "ANDL": 4, "PG": "Q", "depth": 75, "ml-RNT": 31, "ml-ANDL": 0}, {"RNT": 29, "ANDL": 0, "PG": "Q", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 27, "ANDL": 0, "PG": "Q", "depth": 85, "ml-RNT": 27, "ml-ANDL": 0}, {"RNT": 25, "ANDL": 0, "PG": "Q", "depth": 90, "ml-RNT": 25, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Q", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"R": [ {"RNT": 100, "ANDL": 105, "PG": "R", "depth": 35, "ml-RNT": 100, "ml-ANDL": 90}, {"RNT": 79, "ANDL": 61, "PG": "R", "depth": 40, "ml-RNT": 79, "ml-ANDL": 48}, {"RNT": 66, "ANDL": 34, "PG": "R", "depth": 45, "ml-RNT": 66, "ml-ANDL": 24}, {"RNT": 57, "ANDL": 23, "PG": "R", "depth": 50, "ml-RNT": 57, "ml-ANDL": 13}, {"RNT": 49, "ANDL": 16, "PG": "R", "depth": 55, "ml-RNT": 49, "ml-ANDL": 6}, {"RNT": 44, "ANDL": 11, "PG": "R", "depth": 60, "ml-RNT": 44, "ml-ANDL": 2}, {"RNT": 39, "ANDL": 6, "PG": "R", "depth": 65, "ml-RNT": 39, "ml-ANDL": 0}, {"RNT": 36, "ANDL": 4, "PG": "R", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 33, "ANDL": 2, "PG": "R", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 30, "ANDL": 0, "PG": "R", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "R", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"S": [ {"RNT": 108, "ANDL": 97, "PG": "S", "depth": 35, "ml-RNT": 108, "ml-ANDL": 82}, {"RNT": 85, "ANDL": 55, "PG": "S", "depth": 40, "ml-RNT": 85, "ml-ANDL": 42}, {"RNT": 70, "ANDL": 30, "PG": "S", "depth": 45, "ml-RNT": 70, "ml-ANDL": 20}, {"RNT": 60, "ANDL": 20, "PG": "S", "depth": 50, "ml-RNT": 60, "ml-ANDL": 10}, {"RNT": 52, "ANDL": 13, "PG": "S", "depth": 55, "ml-RNT": 52, "ml-ANDL": 3}, {"RNT": 47, "ANDL": 8, "PG": "S", "depth": 60, "ml-RNT": 46, "ml-ANDL": 0}, {"RNT": 42, "ANDL": 3, "PG": "S", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 38, "ANDL": 2, "PG": "S", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 35, "ANDL": 0, "PG": "S", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "S", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"T": [ {"RNT": 117, "ANDL": 88, "PG": "T", "depth": 35, "ml-RNT": 117, "ml-ANDL": 73}, {"RNT": 91, "ANDL": 49, "PG": "T", "depth": 40, "ml-RNT": 91, "ml-ANDL": 36}, {"RNT": 74, "ANDL": 26, "PG": "T", "depth": 45, "ml-RNT": 74, "ml-ANDL": 16}, {"RNT": 63, "ANDL": 17, "PG": "T", "depth": 50, "ml-RNT": 63, "ml-ANDL": 7}, {"RNT": 55, "ANDL": 10, "PG": "T", "depth": 55, "ml-RNT": 55, "ml-ANDL": 0}, {"RNT": 49, "ANDL": 6, "PG": "T", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 43, "ANDL": 2, "PG": "T", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 40, "ANDL": 0, "PG": "T", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "T", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"U": [ {"RNT": 127, "ANDL": 78, "PG": "U", "depth": 35, "ml-RNT": 127, "ml-ANDL": 63}, {"RNT": 97, "ANDL": 43, "PG": "U", "depth": 40, "ml-RNT": 97, "ml-ANDL": 30}, {"RNT": 79, "ANDL": 21, "PG": "U", "depth": 45, "ml-RNT": 79, "ml-ANDL": 11}, {"RNT": 67, "ANDL": 13, "PG": "U", "depth": 50, "ml-RNT": 67, "ml-ANDL": 3}, {"RNT": 58, "ANDL": 7, "PG": "U", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 52, "ANDL": 3, "PG": "U", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 45, "ANDL": 0, "PG": "U", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "U", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"V": [ {"RNT": 139, "ANDL": 66, "PG": "V", "depth": 35, "ml-RNT": 139, "ml-ANDL": 51}, {"RNT": 104, "ANDL": 36, "PG": "V", "depth": 40, "ml-RNT": 104, "ml-ANDL": 23}, {"RNT": 84, "ANDL": 16, "PG": "V", "depth": 45, "ml-RNT": 84, "ml-ANDL": 6}, {"RNT": 71, "ANDL": 9, "PG": "V", "depth": 50, "ml-RNT": 70, "ml-ANDL": 0}, {"RNT": 61, "ANDL": 4, "PG": "V", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 54, "ANDL": 1, "PG": "V", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "V", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"W": [ {"RNT": 152, "ANDL": 53, "PG": "W", "depth": 35, "ml-RNT": 152, "ml-ANDL": 38}, {"RNT": 111, "ANDL": 29, "PG": "W", "depth": 40, "ml-RNT": 111, "ml-ANDL": 16}, {"RNT": 89, "ANDL": 11, "PG": "W", "depth": 45, "ml-RNT": 89, "ml-ANDL": 0}, {"RNT": 75, "ANDL": 5, "PG": "W", "depth": 50, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 65, "ANDL": 0, "PG": "W", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 55, "ANDL": 0, "PG": "W", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "W", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"X": [ {"RNT": 168, "ANDL": 37, "PG": "X", "depth": 35, "ml-RNT": 168, "ml-ANDL": 22}, {"RNT": 120, "ANDL": 20, "PG": "X", "depth": 40, "ml-RNT": 120, "ml-ANDL": 7}, {"RNT": 95, "ANDL": 5, "PG": "X", "depth": 45, "ml-RNT": 90, "ml-ANDL": 0}, {"RNT": 80, "ANDL": 0, "PG": "X", "depth": 50, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "X", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"Y": [ {"RNT": 188, "ANDL": 17, "PG": "Y", "depth": 35, "ml-RNT": 190, "ml-ANDL": 0}, {"RNT": 129, "ANDL": 11, "PG": "Y", "depth": 40, "ml-RNT": 127, "ml-ANDL": 0}, {"RNT": 97, "ANDL": 3, "PG": "Y", "depth": 45, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 50, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Y", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}],
"Z": [ {"RNT": 205, "ANDL": 0, "PG": "Z", "depth": 35, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 140, "ANDL": 0, "PG": "Z", "depth": 40, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 100, "ANDL": 0, "PG": "Z", "depth": 45, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 50, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 55, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 60, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 65, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 70, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 75, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 80, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 85, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 90, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 95, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 100, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 110, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 120, "ml-RNT": 0, "ml-ANDL": 0}, {"RNT": 0, "ANDL": 0, "PG": "Z", "depth": 130, "ml-RNT": 0, "ml-ANDL": 0}]
}

DepthTableFT = // [LMNT 20150604]: Auto populated table based on Padi's Table 1. Changed "arrow" values
{
"35": [{"time": 10, "depth": 35, "PG": "A", "safetyStop": false}, {"time": 19, "depth": 35, "PG": "B", "safetyStop": false}, {"time": 25, "depth": 35, "PG": "C", "safetyStop": false}, {"time": 29, "depth": 35, "PG": "D", "safetyStop": false}, {"time": 32, "depth": 35, "PG": "E", "safetyStop": false}, {"time": 36, "depth": 35, "PG": "F", "safetyStop": false}, {"time": 40, "depth": 35, "PG": "G", "safetyStop": false}, {"time": 44, "depth": 35, "PG": "H", "safetyStop": false}, {"time": 48, "depth": 35, "PG": "I", "safetyStop": false}, {"time": 52, "depth": 35, "PG": "J", "safetyStop": false}, {"time": 57, "depth": 35, "PG": "K", "safetyStop": false}, {"time": 62, "depth": 35, "PG": "L", "safetyStop": false}, {"time": 67, "depth": 35, "PG": "M", "safetyStop": false}, {"time": 73, "depth": 35, "PG": "N", "safetyStop": false}, {"time": 79, "depth": 35, "PG": "O", "safetyStop": false}, {"time": 85, "depth": 35, "PG": "P", "safetyStop": false}, {"time": 92, "depth": 35, "PG": "Q", "safetyStop": false}, {"time": 100, "depth": 35, "PG": "R", "safetyStop": false}, {"time": 108, "depth": 35, "PG": "S", "safetyStop": false}, {"time": 117, "depth": 35, "PG": "T", "safetyStop": false}, {"time": 127, "depth": 35, "PG": "U", "safetyStop": false}, {"time": 139, "depth": 35, "PG": "V", "safetyStop": false}, {"time": 152, "depth": 35, "PG": "W", "safetyStop": true}, {"time": 168, "depth": 35, "PG": "X", "safetyStop": true}, {"time": 188, "depth": 35, "PG": "Y", "safetyStop": true}, {"time": 205, "depth": 35, "PG": "Z", "safetyStop": true}],
"40": [{"time": 9, "depth": 40, "PG": "A", "safetyStop": false}, {"time": 16, "depth": 40, "PG": "B", "safetyStop": false}, {"time": 22, "depth": 40, "PG": "C", "safetyStop": false}, {"time": 25, "depth": 40, "PG": "D", "safetyStop": false}, {"time": 27, "depth": 40, "PG": "E", "safetyStop": false}, {"time": 31, "depth": 40, "PG": "F", "safetyStop": false}, {"time": 34, "depth": 40, "PG": "G", "safetyStop": false}, {"time": 37, "depth": 40, "PG": "H", "safetyStop": false}, {"time": 40, "depth": 40, "PG": "I", "safetyStop": false}, {"time": 44, "depth": 40, "PG": "J", "safetyStop": false}, {"time": 48, "depth": 40, "PG": "K", "safetyStop": false}, {"time": 51, "depth": 40, "PG": "L", "safetyStop": false}, {"time": 55, "depth": 40, "PG": "M", "safetyStop": false}, {"time": 60, "depth": 40, "PG": "N", "safetyStop": false}, {"time": 64, "depth": 40, "PG": "O", "safetyStop": false}, {"time": 69, "depth": 40, "PG": "P", "safetyStop": false}, {"time": 74, "depth": 40, "PG": "Q", "safetyStop": false}, {"time": 79, "depth": 40, "PG": "R", "safetyStop": false}, {"time": 85, "depth": 40, "PG": "S", "safetyStop": false}, {"time": 91, "depth": 40, "PG": "T", "safetyStop": false}, {"time": 97, "depth": 40, "PG": "U", "safetyStop": false}, {"time": 104, "depth": 40, "PG": "V", "safetyStop": false}, {"time": 111, "depth": 40, "PG": "W", "safetyStop": true}, {"time": 120, "depth": 40, "PG": "X", "safetyStop": true}, {"time": 129, "depth": 40, "PG": "Y", "safetyStop": true}, {"time": 140, "depth": 40, "PG": "Z", "safetyStop": true}],
"45": [{"time": 8, "depth": 45, "PG": "A", "safetyStop": false}, {"time": 14, "depth": 45, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 45, "PG": "C", "safetyStop": false}, {"time": 21, "depth": 45, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 45, "PG": "E", "safetyStop": false}, {"time": 26, "depth": 45, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 45, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 45, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 45, "PG": "I", "safetyStop": false}, {"time": 38, "depth": 45, "PG": "J", "safetyStop": false}, {"time": 41, "depth": 45, "PG": "K", "safetyStop": false}, {"time": 44, "depth": 45, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 45, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 45, "PG": "N", "safetyStop": false}, {"time": 54, "depth": 45, "PG": "O", "safetyStop": false}, {"time": 58, "depth": 45, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 45, "PG": "Q", "safetyStop": false}, {"time": 66, "depth": 45, "PG": "R", "safetyStop": false}, {"time": 70, "depth": 45, "PG": "S", "safetyStop": false}, {"time": 74, "depth": 45, "PG": "T", "safetyStop": false}, {"time": 79, "depth": 45, "PG": "U", "safetyStop": false}, {"time": 84, "depth": 45, "PG": "V", "safetyStop": false}, {"time": 89, "depth": 45, "PG": "W", "safetyStop": true}, {"time": 95, "depth": 45, "PG": "X", "safetyStop": true}, {"time": 97, "depth": 45, "PG": "Y", "safetyStop": true}, {"time": 100, "depth": 45, "PG": "Z", "safetyStop": true}],
"50": [{"time": 7, "depth": 50, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 50, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 50, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 50, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 50, "PG": "E", "safetyStop": false}, {"time": 24, "depth": 50, "PG": "F", "safetyStop": false}, {"time": 26, "depth": 50, "PG": "G", "safetyStop": false}, {"time": 28, "depth": 50, "PG": "H", "safetyStop": false}, {"time": 31, "depth": 50, "PG": "I", "safetyStop": false}, {"time": 33, "depth": 50, "PG": "J", "safetyStop": false}, {"time": 36, "depth": 50, "PG": "K", "safetyStop": false}, {"time": 39, "depth": 50, "PG": "L", "safetyStop": false}, {"time": 41, "depth": 50, "PG": "M", "safetyStop": false}, {"time": 44, "depth": 50, "PG": "N", "safetyStop": false}, {"time": 47, "depth": 50, "PG": "O", "safetyStop": false}, {"time": 50, "depth": 50, "PG": "P", "safetyStop": false}, {"time": 53, "depth": 50, "PG": "Q", "safetyStop": false}, {"time": 57, "depth": 50, "PG": "R", "safetyStop": false}, {"time": 60, "depth": 50, "PG": "S", "safetyStop": false}, {"time": 63, "depth": 50, "PG": "T", "safetyStop": false}, {"time": 67, "depth": 50, "PG": "U", "safetyStop": true}, {"time": 71, "depth": 50, "PG": "V", "safetyStop": true}, {"time": 75, "depth": 50, "PG": "W", "safetyStop": true}, {"time": 80, "depth": 50, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 50, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 50, "PG": "Z", "safetyStop": true}],
"55": [{"time": 6, "depth": 55, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 55, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 55, "PG": "C", "safetyStop": false}, {"time": 17, "depth": 55, "PG": "D", "safetyStop": false}, {"time": 19, "depth": 55, "PG": "E", "safetyStop": false}, {"time": 21, "depth": 55, "PG": "F", "safetyStop": false}, {"time": 23, "depth": 55, "PG": "G", "safetyStop": false}, {"time": 25, "depth": 55, "PG": "H", "safetyStop": false}, {"time": 27, "depth": 55, "PG": "I", "safetyStop": false}, {"time": 29, "depth": 55, "PG": "J", "safetyStop": false}, {"time": 32, "depth": 55, "PG": "K", "safetyStop": false}, {"time": 34, "depth": 55, "PG": "L", "safetyStop": false}, {"time": 36, "depth": 55, "PG": "M", "safetyStop": false}, {"time": 38, "depth": 55, "PG": "N", "safetyStop": false}, {"time": 41, "depth": 55, "PG": "O", "safetyStop": false}, {"time": 44, "depth": 55, "PG": "P", "safetyStop": false}, {"time": 46, "depth": 55, "PG": "Q", "safetyStop": false}, {"time": 49, "depth": 55, "PG": "R", "safetyStop": false}, {"time": 52, "depth": 55, "PG": "S", "safetyStop": false}, {"time": 55, "depth": 55, "PG": "T", "safetyStop": true}, {"time": 58, "depth": 55, "PG": "U", "safetyStop": true}, {"time": 61, "depth": 55, "PG": "V", "safetyStop": true}, {"time": 65, "depth": 55, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "Z", "safetyStop": true}],
"60": [{"time": 6, "depth": 60, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 60, "PG": "B", "safetyStop": false}, {"time": 14, "depth": 60, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 60, "PG": "D", "safetyStop": false}, {"time": 17, "depth": 60, "PG": "E", "safetyStop": false}, {"time": 19, "depth": 60, "PG": "F", "safetyStop": false}, {"time": 21, "depth": 60, "PG": "G", "safetyStop": false}, {"time": 23, "depth": 60, "PG": "H", "safetyStop": false}, {"time": 25, "depth": 60, "PG": "I", "safetyStop": false}, {"time": 27, "depth": 60, "PG": "J", "safetyStop": false}, {"time": 29, "depth": 60, "PG": "K", "safetyStop": false}, {"time": 31, "depth": 60, "PG": "L", "safetyStop": false}, {"time": 33, "depth": 60, "PG": "M", "safetyStop": false}, {"time": 35, "depth": 60, "PG": "N", "safetyStop": false}, {"time": 37, "depth": 60, "PG": "O", "safetyStop": false}, {"time": 39, "depth": 60, "PG": "P", "safetyStop": false}, {"time": 42, "depth": 60, "PG": "Q", "safetyStop": false}, {"time": 44, "depth": 60, "PG": "R", "safetyStop": false}, {"time": 47, "depth": 60, "PG": "S", "safetyStop": false}, {"time": 49, "depth": 60, "PG": "T", "safetyStop": true}, {"time": 52, "depth": 60, "PG": "U", "safetyStop": true}, {"time": 54, "depth": 60, "PG": "V", "safetyStop": true}, {"time": 55, "depth": 60, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "Z", "safetyStop": true}],
"65": [{"time": 5, "depth": 65, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 65, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 65, "PG": "C", "safetyStop": false}, {"time": 14, "depth": 65, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 65, "PG": "E", "safetyStop": false}, {"time": 17, "depth": 65, "PG": "F", "safetyStop": false}, {"time": 19, "depth": 65, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 65, "PG": "H", "safetyStop": false}, {"time": 22, "depth": 65, "PG": "I", "safetyStop": false}, {"time": 24, "depth": 65, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 65, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 65, "PG": "L", "safetyStop": false}, {"time": 29, "depth": 65, "PG": "M", "safetyStop": false}, {"time": 31, "depth": 65, "PG": "N", "safetyStop": false}, {"time": 33, "depth": 65, "PG": "O", "safetyStop": false}, {"time": 35, "depth": 65, "PG": "P", "safetyStop": false}, {"time": 37, "depth": 65, "PG": "Q", "safetyStop": false}, {"time": 39, "depth": 65, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 65, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 65, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 65, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "Z", "safetyStop": true}],
"70": [{"time": 5, "depth": 70, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 70, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 70, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 70, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 70, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 70, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 70, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 70, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 70, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 70, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 70, "PG": "K", "safetyStop": false}, {"time": 26, "depth": 70, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 70, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 70, "PG": "N", "safetyStop": false}, {"time": 31, "depth": 70, "PG": "O", "safetyStop": false}, {"time": 33, "depth": 70, "PG": "P", "safetyStop": false}, {"time": 35, "depth": 70, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 70, "PG": "R", "safetyStop": true}, {"time": 38, "depth": 70, "PG": "S", "safetyStop": true}, {"time": 40, "depth": 70, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "Z", "safetyStop": true}],
"75": [{"time": 4, "depth": 75, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 75, "PG": "B", "safetyStop": false}, {"time": 11, "depth": 75, "PG": "C", "safetyStop": false}, {"time": 12, "depth": 75, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 75, "PG": "E", "safetyStop": false}, {"time": 15, "depth": 75, "PG": "F", "safetyStop": false}, {"time": 16, "depth": 75, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 75, "PG": "H", "safetyStop": false}, {"time": 19, "depth": 75, "PG": "I", "safetyStop": false}, {"time": 20, "depth": 75, "PG": "J", "safetyStop": false}, {"time": 22, "depth": 75, "PG": "K", "safetyStop": false}, {"time": 23, "depth": 75, "PG": "L", "safetyStop": false}, {"time": 25, "depth": 75, "PG": "M", "safetyStop": false}, {"time": 26, "depth": 75, "PG": "N", "safetyStop": false}, {"time": 28, "depth": 75, "PG": "O", "safetyStop": false}, {"time": 30, "depth": 75, "PG": "P", "safetyStop": true}, {"time": 31, "depth": 75, "PG": "Q", "safetyStop": true}, {"time": 33, "depth": 75, "PG": "R", "safetyStop": true}, {"time": 35, "depth": 75, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "Z", "safetyStop": true}],
"80": [{"time": 4, "depth": 80, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 80, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 80, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 80, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 80, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 80, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 80, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 80, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 80, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 80, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 80, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 80, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 80, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 80, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 80, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 80, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 80, "PG": "Q", "safetyStop": true}, {"time": 30, "depth": 80, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "Z", "safetyStop": true}],
"85": [{"time": 4, "depth": 85, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 85, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 85, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 85, "PG": "D", "safetyStop": false}, {"time": 12, "depth": 85, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 85, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 85, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 85, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 85, "PG": "I", "safetyStop": false}, {"time": 18, "depth": 85, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 85, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 85, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 85, "PG": "M", "safetyStop": false}, {"time": 23, "depth": 85, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 85, "PG": "O", "safetyStop": true}, {"time": 25, "depth": 85, "PG": "P", "safetyStop": true}, {"time": 27, "depth": 85, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "Z", "safetyStop": true}],
"90": [{"time": 4, "depth": 90, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 90, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 90, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 90, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 90, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 90, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 90, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 90, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 90, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 90, "PG": "J", "safetyStop": false}, {"time": 18, "depth": 90, "PG": "K", "safetyStop": false}, {"time": 19, "depth": 90, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 90, "PG": "M", "safetyStop": false}, {"time": 22, "depth": 90, "PG": "N", "safetyStop": true}, {"time": 23, "depth": 90, "PG": "O", "safetyStop": true}, {"time": 24, "depth": 90, "PG": "P", "safetyStop": true}, {"time": 25, "depth": 90, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "Z", "safetyStop": true}],
"95": [{"time": 3, "depth": 95, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 95, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 95, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 95, "PG": "D", "safetyStop": false}, {"time": 10, "depth": 95, "PG": "E", "safetyStop": false}, {"time": 11, "depth": 95, "PG": "F", "safetyStop": false}, {"time": 12, "depth": 95, "PG": "G", "safetyStop": false}, {"time": 13, "depth": 95, "PG": "H", "safetyStop": false}, {"time": 14, "depth": 95, "PG": "I", "safetyStop": false}, {"time": 15, "depth": 95, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 95, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 95, "PG": "L", "safetyStop": false}, {"time": 19, "depth": 95, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 95, "PG": "N", "safetyStop": true}, {"time": 21, "depth": 95, "PG": "O", "safetyStop": true}, {"time": 22, "depth": 95, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Z", "safetyStop": true}],
"100": [{"time": 3, "depth": 100, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 100, "PG": "B", "safetyStop": true}, {"time": 8, "depth": 100, "PG": "C", "safetyStop": true}, {"time": 9, "depth": 100, "PG": "D", "safetyStop": true}, {"time": 10, "depth": 100, "PG": "E", "safetyStop": true}, {"time": 11, "depth": 100, "PG": "F", "safetyStop": true}, {"time": 12, "depth": 100, "PG": "G", "safetyStop": true}, {"time": 13, "depth": 100, "PG": "H", "safetyStop": true}, {"time": 14, "depth": 100, "PG": "I", "safetyStop": true}, {"time": 15, "depth": 100, "PG": "J", "safetyStop": true}, {"time": 16, "depth": 100, "PG": "K", "safetyStop": true}, {"time": 17, "depth": 100, "PG": "L", "safetyStop": true}, {"time": 18, "depth": 100, "PG": "M", "safetyStop": true}, {"time": 19, "depth": 100, "PG": "N", "safetyStop": true}, {"time": 20, "depth": 100, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Z", "safetyStop": true}],
"110": [{"time": 3, "depth": 110, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 110, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 110, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 110, "PG": "D", "safetyStop": true}, {"time": 9, "depth": 110, "PG": "E", "safetyStop": true}, {"time": 10, "depth": 110, "PG": "F", "safetyStop": true}, {"time": 11, "depth": 110, "PG": "G", "safetyStop": true}, {"time": 12, "depth": 110, "PG": "H", "safetyStop": true}, {"time": 13, "depth": 110, "PG": "I", "safetyStop": true}, {"time": 13, "depth": 110, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 110, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 110, "PG": "L", "safetyStop": true}, {"time": 16, "depth": 110, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Z", "safetyStop": true}],
"120": [{"time": 3, "depth": 120, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 120, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 120, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 120, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 120, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 120, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 120, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 120, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 120, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 120, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 120, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Z", "safetyStop": true}],
"130": [{"time": 3, "depth": 130, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 130, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 130, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 130, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 130, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 130, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 130, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 130, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Z", "safetyStop": true}],
"140": [{"time": 0, "depth": 140, "PG": "A", "safetyStop": true}, {"time": 4, "depth": 140, "PG": "B", "safetyStop": true}, {"time": 5, "depth": 140, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 140, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 140, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 140, "PG": "F", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Z", "safetyStop": true}],
}

// DepthTableFT = // [LMNT 20150603]: Auto populated table based on Padi's Table 1
// {
// "35": [{"time": 10, "depth": 35, "PG": "A", "safetyStop": false}, {"time": 19, "depth": 35, "PG": "B", "safetyStop": false}, {"time": 25, "depth": 35, "PG": "C", "safetyStop": false}, {"time": 29, "depth": 35, "PG": "D", "safetyStop": false}, {"time": 32, "depth": 35, "PG": "E", "safetyStop": false}, {"time": 36, "depth": 35, "PG": "F", "safetyStop": false}, {"time": 40, "depth": 35, "PG": "G", "safetyStop": false}, {"time": 44, "depth": 35, "PG": "H", "safetyStop": false}, {"time": 48, "depth": 35, "PG": "I", "safetyStop": false}, {"time": 52, "depth": 35, "PG": "J", "safetyStop": false}, {"time": 57, "depth": 35, "PG": "K", "safetyStop": false}, {"time": 62, "depth": 35, "PG": "L", "safetyStop": false}, {"time": 67, "depth": 35, "PG": "M", "safetyStop": false}, {"time": 73, "depth": 35, "PG": "N", "safetyStop": false}, {"time": 79, "depth": 35, "PG": "O", "safetyStop": false}, {"time": 85, "depth": 35, "PG": "P", "safetyStop": false}, {"time": 92, "depth": 35, "PG": "Q", "safetyStop": false}, {"time": 100, "depth": 35, "PG": "R", "safetyStop": false}, {"time": 108, "depth": 35, "PG": "S", "safetyStop": false}, {"time": 117, "depth": 35, "PG": "T", "safetyStop": false}, {"time": 127, "depth": 35, "PG": "U", "safetyStop": false}, {"time": 139, "depth": 35, "PG": "V", "safetyStop": false}, {"time": 152, "depth": 35, "PG": "W", "safetyStop": true}, {"time": 168, "depth": 35, "PG": "X", "safetyStop": true}, {"time": 188, "depth": 35, "PG": "Y", "safetyStop": true}, {"time": 205, "depth": 35, "PG": "Z", "safetyStop": true}],
// "40": [{"time": 9, "depth": 40, "PG": "A", "safetyStop": false}, {"time": 16, "depth": 40, "PG": "B", "safetyStop": false}, {"time": 22, "depth": 40, "PG": "C", "safetyStop": false}, {"time": 25, "depth": 40, "PG": "D", "safetyStop": false}, {"time": 27, "depth": 40, "PG": "E", "safetyStop": false}, {"time": 31, "depth": 40, "PG": "F", "safetyStop": false}, {"time": 34, "depth": 40, "PG": "G", "safetyStop": false}, {"time": 37, "depth": 40, "PG": "H", "safetyStop": false}, {"time": 40, "depth": 40, "PG": "I", "safetyStop": false}, {"time": 44, "depth": 40, "PG": "J", "safetyStop": false}, {"time": 48, "depth": 40, "PG": "K", "safetyStop": false}, {"time": 51, "depth": 40, "PG": "L", "safetyStop": false}, {"time": 55, "depth": 40, "PG": "M", "safetyStop": false}, {"time": 60, "depth": 40, "PG": "N", "safetyStop": false}, {"time": 64, "depth": 40, "PG": "O", "safetyStop": false}, {"time": 69, "depth": 40, "PG": "P", "safetyStop": false}, {"time": 74, "depth": 40, "PG": "Q", "safetyStop": false}, {"time": 79, "depth": 40, "PG": "R", "safetyStop": false}, {"time": 85, "depth": 40, "PG": "S", "safetyStop": false}, {"time": 91, "depth": 40, "PG": "T", "safetyStop": false}, {"time": 97, "depth": 40, "PG": "U", "safetyStop": false}, {"time": 104, "depth": 40, "PG": "V", "safetyStop": false}, {"time": 111, "depth": 40, "PG": "W", "safetyStop": true}, {"time": 120, "depth": 40, "PG": "X", "safetyStop": true}, {"time": 129, "depth": 40, "PG": "Y", "safetyStop": true}, {"time": 140, "depth": 40, "PG": "Z", "safetyStop": true}],
// "45": [{"time": 8, "depth": 45, "PG": "A", "safetyStop": false}, {"time": 14, "depth": 45, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 45, "PG": "C", "safetyStop": false}, {"time": 21, "depth": 45, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 45, "PG": "E", "safetyStop": false}, {"time": 26, "depth": 45, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 45, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 45, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 45, "PG": "I", "safetyStop": false}, {"time": 38, "depth": 45, "PG": "J", "safetyStop": false}, {"time": 41, "depth": 45, "PG": "K", "safetyStop": false}, {"time": 44, "depth": 45, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 45, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 45, "PG": "N", "safetyStop": false}, {"time": 54, "depth": 45, "PG": "O", "safetyStop": false}, {"time": 58, "depth": 45, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 45, "PG": "Q", "safetyStop": false}, {"time": 66, "depth": 45, "PG": "R", "safetyStop": false}, {"time": 70, "depth": 45, "PG": "S", "safetyStop": false}, {"time": 74, "depth": 45, "PG": "T", "safetyStop": false}, {"time": 79, "depth": 45, "PG": "U", "safetyStop": false}, {"time": 84, "depth": 45, "PG": "V", "safetyStop": false}, {"time": 89, "depth": 45, "PG": "W", "safetyStop": true}, {"time": 95, "depth": 45, "PG": "X", "safetyStop": true}, {"time": 97, "depth": 45, "PG": "Y", "safetyStop": true}, {"time": 100, "depth": 45, "PG": "Z", "safetyStop": true}],
// "50": [{"time": 7, "depth": 50, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 50, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 50, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 50, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 50, "PG": "E", "safetyStop": false}, {"time": 24, "depth": 50, "PG": "F", "safetyStop": false}, {"time": 26, "depth": 50, "PG": "G", "safetyStop": false}, {"time": 28, "depth": 50, "PG": "H", "safetyStop": false}, {"time": 31, "depth": 50, "PG": "I", "safetyStop": false}, {"time": 33, "depth": 50, "PG": "J", "safetyStop": false}, {"time": 36, "depth": 50, "PG": "K", "safetyStop": false}, {"time": 39, "depth": 50, "PG": "L", "safetyStop": false}, {"time": 41, "depth": 50, "PG": "M", "safetyStop": false}, {"time": 44, "depth": 50, "PG": "N", "safetyStop": false}, {"time": 47, "depth": 50, "PG": "O", "safetyStop": false}, {"time": 50, "depth": 50, "PG": "P", "safetyStop": false}, {"time": 53, "depth": 50, "PG": "Q", "safetyStop": false}, {"time": 57, "depth": 50, "PG": "R", "safetyStop": false}, {"time": 60, "depth": 50, "PG": "S", "safetyStop": false}, {"time": 63, "depth": 50, "PG": "T", "safetyStop": false}, {"time": 67, "depth": 50, "PG": "U", "safetyStop": true}, {"time": 71, "depth": 50, "PG": "V", "safetyStop": true}, {"time": 75, "depth": 50, "PG": "W", "safetyStop": true}, {"time": 80, "depth": 50, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 50, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 50, "PG": "Z", "safetyStop": true}],
// "55": [{"time": 6, "depth": 55, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 55, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 55, "PG": "C", "safetyStop": false}, {"time": 17, "depth": 55, "PG": "D", "safetyStop": false}, {"time": 19, "depth": 55, "PG": "E", "safetyStop": false}, {"time": 21, "depth": 55, "PG": "F", "safetyStop": false}, {"time": 23, "depth": 55, "PG": "G", "safetyStop": false}, {"time": 25, "depth": 55, "PG": "H", "safetyStop": false}, {"time": 27, "depth": 55, "PG": "I", "safetyStop": false}, {"time": 29, "depth": 55, "PG": "J", "safetyStop": false}, {"time": 32, "depth": 55, "PG": "K", "safetyStop": false}, {"time": 34, "depth": 55, "PG": "L", "safetyStop": false}, {"time": 36, "depth": 55, "PG": "M", "safetyStop": false}, {"time": 38, "depth": 55, "PG": "N", "safetyStop": false}, {"time": 41, "depth": 55, "PG": "O", "safetyStop": false}, {"time": 44, "depth": 55, "PG": "P", "safetyStop": false}, {"time": 46, "depth": 55, "PG": "Q", "safetyStop": false}, {"time": 49, "depth": 55, "PG": "R", "safetyStop": false}, {"time": 52, "depth": 55, "PG": "S", "safetyStop": false}, {"time": 55, "depth": 55, "PG": "T", "safetyStop": true}, {"time": 58, "depth": 55, "PG": "U", "safetyStop": true}, {"time": 61, "depth": 55, "PG": "V", "safetyStop": true}, {"time": 65, "depth": 55, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 55, "PG": "Z", "safetyStop": true}],
// "60": [{"time": 6, "depth": 60, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 60, "PG": "B", "safetyStop": false}, {"time": 14, "depth": 60, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 60, "PG": "D", "safetyStop": false}, {"time": 17, "depth": 60, "PG": "E", "safetyStop": false}, {"time": 19, "depth": 60, "PG": "F", "safetyStop": false}, {"time": 21, "depth": 60, "PG": "G", "safetyStop": false}, {"time": 23, "depth": 60, "PG": "H", "safetyStop": false}, {"time": 25, "depth": 60, "PG": "I", "safetyStop": false}, {"time": 27, "depth": 60, "PG": "J", "safetyStop": false}, {"time": 29, "depth": 60, "PG": "K", "safetyStop": false}, {"time": 31, "depth": 60, "PG": "L", "safetyStop": false}, {"time": 33, "depth": 60, "PG": "M", "safetyStop": false}, {"time": 35, "depth": 60, "PG": "N", "safetyStop": false}, {"time": 37, "depth": 60, "PG": "O", "safetyStop": false}, {"time": 39, "depth": 60, "PG": "P", "safetyStop": false}, {"time": 42, "depth": 60, "PG": "Q", "safetyStop": false}, {"time": 44, "depth": 60, "PG": "R", "safetyStop": false}, {"time": 47, "depth": 60, "PG": "S", "safetyStop": false}, {"time": 49, "depth": 60, "PG": "T", "safetyStop": true}, {"time": 52, "depth": 60, "PG": "U", "safetyStop": true}, {"time": 54, "depth": 60, "PG": "V", "safetyStop": true}, {"time": 55, "depth": 60, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 60, "PG": "Z", "safetyStop": true}],
// "65": [{"time": 5, "depth": 65, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 65, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 65, "PG": "C", "safetyStop": false}, {"time": 14, "depth": 65, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 65, "PG": "E", "safetyStop": false}, {"time": 17, "depth": 65, "PG": "F", "safetyStop": false}, {"time": 19, "depth": 65, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 65, "PG": "H", "safetyStop": false}, {"time": 22, "depth": 65, "PG": "I", "safetyStop": false}, {"time": 24, "depth": 65, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 65, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 65, "PG": "L", "safetyStop": false}, {"time": 29, "depth": 65, "PG": "M", "safetyStop": false}, {"time": 31, "depth": 65, "PG": "N", "safetyStop": false}, {"time": 33, "depth": 65, "PG": "O", "safetyStop": false}, {"time": 35, "depth": 65, "PG": "P", "safetyStop": false}, {"time": 37, "depth": 65, "PG": "Q", "safetyStop": false}, {"time": 39, "depth": 65, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 65, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 65, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 65, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 65, "PG": "Z", "safetyStop": true}],
// "70": [{"time": 5, "depth": 70, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 70, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 70, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 70, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 70, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 70, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 70, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 70, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 70, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 70, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 70, "PG": "K", "safetyStop": false}, {"time": 26, "depth": 70, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 70, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 70, "PG": "N", "safetyStop": false}, {"time": 31, "depth": 70, "PG": "O", "safetyStop": false}, {"time": 33, "depth": 70, "PG": "P", "safetyStop": false}, {"time": 35, "depth": 70, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 70, "PG": "R", "safetyStop": true}, {"time": 38, "depth": 70, "PG": "S", "safetyStop": true}, {"time": 40, "depth": 70, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 70, "PG": "Z", "safetyStop": true}],
// "75": [{"time": 4, "depth": 75, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 75, "PG": "B", "safetyStop": false}, {"time": 11, "depth": 75, "PG": "C", "safetyStop": false}, {"time": 12, "depth": 75, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 75, "PG": "E", "safetyStop": false}, {"time": 15, "depth": 75, "PG": "F", "safetyStop": false}, {"time": 16, "depth": 75, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 75, "PG": "H", "safetyStop": false}, {"time": 19, "depth": 75, "PG": "I", "safetyStop": false}, {"time": 20, "depth": 75, "PG": "J", "safetyStop": false}, {"time": 22, "depth": 75, "PG": "K", "safetyStop": false}, {"time": 23, "depth": 75, "PG": "L", "safetyStop": false}, {"time": 25, "depth": 75, "PG": "M", "safetyStop": false}, {"time": 26, "depth": 75, "PG": "N", "safetyStop": false}, {"time": 28, "depth": 75, "PG": "O", "safetyStop": false}, {"time": 30, "depth": 75, "PG": "P", "safetyStop": true}, {"time": 31, "depth": 75, "PG": "Q", "safetyStop": true}, {"time": 33, "depth": 75, "PG": "R", "safetyStop": true}, {"time": 35, "depth": 75, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 75, "PG": "Z", "safetyStop": true}],
// "80": [{"time": 4, "depth": 80, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 80, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 80, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 80, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 80, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 80, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 80, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 80, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 80, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 80, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 80, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 80, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 80, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 80, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 80, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 80, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 80, "PG": "Q", "safetyStop": true}, {"time": 30, "depth": 80, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 80, "PG": "Z", "safetyStop": true}],
// "85": [{"time": 4, "depth": 85, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 85, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 85, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 85, "PG": "D", "safetyStop": false}, {"time": 12, "depth": 85, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 85, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 85, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 85, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 85, "PG": "I", "safetyStop": false}, {"time": 18, "depth": 85, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 85, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 85, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 85, "PG": "M", "safetyStop": false}, {"time": 23, "depth": 85, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 85, "PG": "O", "safetyStop": true}, {"time": 25, "depth": 85, "PG": "P", "safetyStop": true}, {"time": 27, "depth": 85, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 85, "PG": "Z", "safetyStop": true}],
// "90": [{"time": 4, "depth": 90, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 90, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 90, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 90, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 90, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 90, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 90, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 90, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 90, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 90, "PG": "J", "safetyStop": false}, {"time": 18, "depth": 90, "PG": "K", "safetyStop": false}, {"time": 19, "depth": 90, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 90, "PG": "M", "safetyStop": false}, {"time": 22, "depth": 90, "PG": "N", "safetyStop": true}, {"time": 23, "depth": 90, "PG": "O", "safetyStop": true}, {"time": 24, "depth": 90, "PG": "P", "safetyStop": true}, {"time": 25, "depth": 90, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 90, "PG": "Z", "safetyStop": true}],
// "95": [{"time": 3, "depth": 95, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 95, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 95, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 95, "PG": "D", "safetyStop": false}, {"time": 10, "depth": 95, "PG": "E", "safetyStop": false}, {"time": 11, "depth": 95, "PG": "F", "safetyStop": false}, {"time": 12, "depth": 95, "PG": "G", "safetyStop": false}, {"time": 13, "depth": 95, "PG": "H", "safetyStop": false}, {"time": 14, "depth": 95, "PG": "I", "safetyStop": false}, {"time": 15, "depth": 95, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 95, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 95, "PG": "L", "safetyStop": false}, {"time": 19, "depth": 95, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 95, "PG": "N", "safetyStop": true}, {"time": 21, "depth": 95, "PG": "O", "safetyStop": true}, {"time": 22, "depth": 95, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 95, "PG": "Z", "safetyStop": true}],
// "100": [{"time": 3, "depth": 100, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 100, "PG": "B", "safetyStop": true}, {"time": 8, "depth": 100, "PG": "C", "safetyStop": true}, {"time": 9, "depth": 100, "PG": "D", "safetyStop": true}, {"time": 10, "depth": 100, "PG": "E", "safetyStop": true}, {"time": 11, "depth": 100, "PG": "F", "safetyStop": true}, {"time": 12, "depth": 100, "PG": "G", "safetyStop": true}, {"time": 13, "depth": 100, "PG": "H", "safetyStop": true}, {"time": 14, "depth": 100, "PG": "I", "safetyStop": true}, {"time": 15, "depth": 100, "PG": "J", "safetyStop": true}, {"time": 16, "depth": 100, "PG": "K", "safetyStop": true}, {"time": 17, "depth": 100, "PG": "L", "safetyStop": true}, {"time": 18, "depth": 100, "PG": "M", "safetyStop": true}, {"time": 19, "depth": 100, "PG": "N", "safetyStop": true}, {"time": 20, "depth": 100, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 100, "PG": "Z", "safetyStop": true}],
// "110": [{"time": 3, "depth": 110, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 110, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 110, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 110, "PG": "D", "safetyStop": true}, {"time": 9, "depth": 110, "PG": "E", "safetyStop": true}, {"time": 10, "depth": 110, "PG": "F", "safetyStop": true}, {"time": 11, "depth": 110, "PG": "G", "safetyStop": true}, {"time": 12, "depth": 110, "PG": "H", "safetyStop": true}, {"time": 13, "depth": 110, "PG": "I", "safetyStop": true}, {"time": 14, "depth": 110, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 110, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 110, "PG": "L", "safetyStop": true}, {"time": 16, "depth": 110, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 110, "PG": "Z", "safetyStop": true}],
// "120": [{"time": 3, "depth": 120, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 120, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 120, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 120, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 120, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 120, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 120, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 120, "PG": "H", "safetyStop": true}, {"time": 12, "depth": 120, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 120, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 120, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "Z", "safetyStop": true}],
// "130": [{"time": 3, "depth": 130, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 130, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 130, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 130, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 130, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 130, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 130, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 130, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 130, "PG": "Z", "safetyStop": true}],
// "140": [{"time": 4, "depth": 140, "PG": "A", "safetyStop": true}, {"time": 4, "depth": 140, "PG": "B", "safetyStop": true}, {"time": 5, "depth": 140, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 140, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 140, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 140, "PG": "F", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 140, "PG": "Z", "safetyStop": true}],
// };

// DepthTableFT = //[LMNT 20150603]: Original Table based on Padi's Table 3
// {
// "35": [{"time": 10, "depth": 35, "PG": "A", "safetyStop": false}, {"time": 19, "depth": 35, "PG": "B", "safetyStop": false}, {"time": 25, "depth": 35, "PG": "C", "safetyStop": false}, {"time": 29, "depth": 35, "PG": "D", "safetyStop": false}, {"time": 32, "depth": 35, "PG": "E", "safetyStop": false}, {"time": 36, "depth": 35, "PG": "F", "safetyStop": false}, {"time": 40, "depth": 35, "PG": "G", "safetyStop": false}, {"time": 44, "depth": 35, "PG": "H", "safetyStop": false}, {"time": 48, "depth": 35, "PG": "I", "safetyStop": false}, {"time": 52, "depth": 35, "PG": "J", "safetyStop": false}, {"time": 57, "depth": 35, "PG": "K", "safetyStop": false}, {"time": 62, "depth": 35, "PG": "L", "safetyStop": false}, {"time": 67, "depth": 35, "PG": "M", "safetyStop": false}, {"time": 73, "depth": 35, "PG": "N", "safetyStop": false}, {"time": 79, "depth": 35, "PG": "O", "safetyStop": false}, {"time": 85, "depth": 35, "PG": "P", "safetyStop": false}, {"time": 92, "depth": 35, "PG": "Q", "safetyStop": false}, {"time": 100, "depth": 35, "PG": "R", "safetyStop": false}, {"time": 108, "depth": 35, "PG": "S", "safetyStop": false}, {"time": 117, "depth": 35, "PG": "T", "safetyStop": false}, {"time": 127, "depth": 35, "PG": "U", "safetyStop": false}, {"time": 139, "depth": 35, "PG": "V", "safetyStop": false}, {"time": 152, "depth": 35, "PG": "W", "safetyStop": true}, {"time": 168, "depth": 35, "PG": "X", "safetyStop": true}, {"time": 188, "depth": 35, "PG": "Y", "safetyStop": true}, {"time": 205, "depth": 35, "PG": "Z", "safetyStop": true}],
// "40": [{"time": 9, "depth": 40, "PG": "A", "safetyStop": false}, {"time": 16, "depth": 40, "PG": "B", "safetyStop": false}, {"time": 22, "depth": 40, "PG": "C", "safetyStop": false}, {"time": 25, "depth": 40, "PG": "D", "safetyStop": false}, {"time": 27, "depth": 40, "PG": "E", "safetyStop": false}, {"time": 31, "depth": 40, "PG": "F", "safetyStop": false}, {"time": 34, "depth": 40, "PG": "G", "safetyStop": false}, {"time": 37, "depth": 40, "PG": "H", "safetyStop": false}, {"time": 40, "depth": 40, "PG": "I", "safetyStop": false}, {"time": 44, "depth": 40, "PG": "J", "safetyStop": false}, {"time": 48, "depth": 40, "PG": "K", "safetyStop": false}, {"time": 51, "depth": 40, "PG": "L", "safetyStop": false}, {"time": 55, "depth": 40, "PG": "M", "safetyStop": false}, {"time": 60, "depth": 40, "PG": "N", "safetyStop": false}, {"time": 64, "depth": 40, "PG": "O", "safetyStop": false}, {"time": 69, "depth": 40, "PG": "P", "safetyStop": false}, {"time": 74, "depth": 40, "PG": "Q", "safetyStop": false}, {"time": 79, "depth": 40, "PG": "R", "safetyStop": false}, {"time": 85, "depth": 40, "PG": "S", "safetyStop": false}, {"time": 91, "depth": 40, "PG": "T", "safetyStop": false}, {"time": 97, "depth": 40, "PG": "U", "safetyStop": false}, {"time": 104, "depth": 40, "PG": "V", "safetyStop": false}, {"time": 111, "depth": 40, "PG": "W", "safetyStop": true}, {"time": 120, "depth": 40, "PG": "X", "safetyStop": true}, {"time": 129, "depth": 40, "PG": "Y", "safetyStop": true}, {"time": 140, "depth": 40, "PG": "Z", "safetyStop": true}],
// "45": [{"time": 8, "depth": 45, "PG": "A", "safetyStop": false}, {"time": 14, "depth": 45, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 45, "PG": "C", "safetyStop": false}, {"time": 21, "depth": 45, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 45, "PG": "E", "safetyStop": false}, {"time": 26, "depth": 45, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 45, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 45, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 45, "PG": "I", "safetyStop": false}, {"time": 38, "depth": 45, "PG": "J", "safetyStop": false}, {"time": 41, "depth": 45, "PG": "K", "safetyStop": false}, {"time": 44, "depth": 45, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 45, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 45, "PG": "N", "safetyStop": false}, {"time": 54, "depth": 45, "PG": "O", "safetyStop": false}, {"time": 58, "depth": 45, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 45, "PG": "Q", "safetyStop": false}, {"time": 66, "depth": 45, "PG": "R", "safetyStop": false}, {"time": 70, "depth": 45, "PG": "S", "safetyStop": false}, {"time": 74, "depth": 45, "PG": "T", "safetyStop": false}, {"time": 79, "depth": 45, "PG": "U", "safetyStop": false}, {"time": 84, "depth": 45, "PG": "V", "safetyStop": false}, {"time": 89, "depth": 45, "PG": "W", "safetyStop": true}, {"time": 95, "depth": 45, "PG": "X", "safetyStop": true}, {"time": 97, "depth": 45, "PG": "Y", "safetyStop": true}, {"time": 100, "depth": 45, "PG": "Z", "safetyStop": true}],
// "50": [{"time": 7, "depth": 50, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 50, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 50, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 50, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 50, "PG": "E", "safetyStop": false}, {"time": 24, "depth": 50, "PG": "F", "safetyStop": false}, {"time": 26, "depth": 50, "PG": "G", "safetyStop": false}, {"time": 28, "depth": 50, "PG": "H", "safetyStop": false}, {"time": 31, "depth": 50, "PG": "I", "safetyStop": false}, {"time": 33, "depth": 50, "PG": "J", "safetyStop": false}, {"time": 36, "depth": 50, "PG": "K", "safetyStop": false}, {"time": 39, "depth": 50, "PG": "L", "safetyStop": false}, {"time": 41, "depth": 50, "PG": "M", "safetyStop": false}, {"time": 44, "depth": 50, "PG": "N", "safetyStop": false}, {"time": 47, "depth": 50, "PG": "O", "safetyStop": false}, {"time": 50, "depth": 50, "PG": "P", "safetyStop": false}, {"time": 53, "depth": 50, "PG": "Q", "safetyStop": false}, {"time": 57, "depth": 50, "PG": "R", "safetyStop": false}, {"time": 60, "depth": 50, "PG": "S", "safetyStop": false}, {"time": 63, "depth": 50, "PG": "T", "safetyStop": false}, {"time": 67, "depth": 50, "PG": "U", "safetyStop": true}, {"time": 71, "depth": 50, "PG": "V", "safetyStop": true}, {"time": 75, "depth": 50, "PG": "W", "safetyStop": true}, {"time": 80, "depth": 50, "PG": "X", "safetyStop": true}],
// "55": [{"time": 6, "depth": 55, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 55, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 55, "PG": "C", "safetyStop": false}, {"time": 17, "depth": 55, "PG": "D", "safetyStop": false}, {"time": 19, "depth": 55, "PG": "E", "safetyStop": false}, {"time": 21, "depth": 55, "PG": "F", "safetyStop": false}, {"time": 23, "depth": 55, "PG": "G", "safetyStop": false}, {"time": 25, "depth": 55, "PG": "H", "safetyStop": false}, {"time": 27, "depth": 55, "PG": "I", "safetyStop": false}, {"time": 29, "depth": 55, "PG": "J", "safetyStop": false}, {"time": 32, "depth": 55, "PG": "K", "safetyStop": false}, {"time": 34, "depth": 55, "PG": "L", "safetyStop": false}, {"time": 36, "depth": 55, "PG": "M", "safetyStop": false}, {"time": 38, "depth": 55, "PG": "N", "safetyStop": false}, {"time": 41, "depth": 55, "PG": "O", "safetyStop": false}, {"time": 44, "depth": 55, "PG": "P", "safetyStop": false}, {"time": 46, "depth": 55, "PG": "Q", "safetyStop": false}, {"time": 49, "depth": 55, "PG": "R", "safetyStop": false}, {"time": 52, "depth": 55, "PG": "S", "safetyStop": false}, {"time": 55, "depth": 55, "PG": "T", "safetyStop": true}, {"time": 58, "depth": 55, "PG": "U", "safetyStop": true}, {"time": 61, "depth": 55, "PG": "V", "safetyStop": true}, {"time": 65, "depth": 55, "PG": "W", "safetyStop": true}],
// "60": [{"time": 6, "depth": 60, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 60, "PG": "B", "safetyStop": false}, {"time": 14, "depth": 60, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 60, "PG": "D", "safetyStop": false}, {"time": 17, "depth": 60, "PG": "E", "safetyStop": false}, {"time": 19, "depth": 60, "PG": "F", "safetyStop": false}, {"time": 21, "depth": 60, "PG": "G", "safetyStop": false}, {"time": 23, "depth": 60, "PG": "H", "safetyStop": false}, {"time": 25, "depth": 60, "PG": "I", "safetyStop": false}, {"time": 27, "depth": 60, "PG": "J", "safetyStop": false}, {"time": 29, "depth": 60, "PG": "K", "safetyStop": false}, {"time": 31, "depth": 60, "PG": "L", "safetyStop": false}, {"time": 33, "depth": 60, "PG": "M", "safetyStop": false}, {"time": 35, "depth": 60, "PG": "N", "safetyStop": false}, {"time": 37, "depth": 60, "PG": "O", "safetyStop": false}, {"time": 39, "depth": 60, "PG": "P", "safetyStop": false}, {"time": 42, "depth": 60, "PG": "Q", "safetyStop": false}, {"time": 44, "depth": 60, "PG": "R", "safetyStop": false}, {"time": 47, "depth": 60, "PG": "S", "safetyStop": false}, {"time": 49, "depth": 60, "PG": "T", "safetyStop": true}, {"time": 52, "depth": 60, "PG": "U", "safetyStop": true}, {"time": 54, "depth": 60, "PG": "V", "safetyStop": true}, {"time": 55, "depth": 60, "PG": "W", "safetyStop": true}],
// "65": [{"time": 5, "depth": 65, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 65, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 65, "PG": "C", "safetyStop": false}, {"time": 14, "depth": 65, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 65, "PG": "E", "safetyStop": false}, {"time": 17, "depth": 65, "PG": "F", "safetyStop": false}, {"time": 19, "depth": 65, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 65, "PG": "H", "safetyStop": false}, {"time": 22, "depth": 65, "PG": "I", "safetyStop": false}, {"time": 24, "depth": 65, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 65, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 65, "PG": "L", "safetyStop": false}, {"time": 29, "depth": 65, "PG": "M", "safetyStop": false}, {"time": 31, "depth": 65, "PG": "N", "safetyStop": false}, {"time": 33, "depth": 65, "PG": "O", "safetyStop": false}, {"time": 35, "depth": 65, "PG": "P", "safetyStop": false}, {"time": 37, "depth": 65, "PG": "Q", "safetyStop": false}, {"time": 39, "depth": 65, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 65, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 65, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 65, "PG": "U", "safetyStop": true}],
// "70": [{"time": 5, "depth": 70, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 70, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 70, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 70, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 70, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 70, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 70, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 70, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 70, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 70, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 70, "PG": "K", "safetyStop": false}, {"time": 26, "depth": 70, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 70, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 70, "PG": "N", "safetyStop": false}, {"time": 31, "depth": 70, "PG": "O", "safetyStop": false}, {"time": 33, "depth": 70, "PG": "P", "safetyStop": false}, {"time": 35, "depth": 70, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 70, "PG": "R", "safetyStop": true}, {"time": 38, "depth": 70, "PG": "S", "safetyStop": true}, {"time": 40, "depth": 70, "PG": "T", "safetyStop": true}],
// "75": [{"time": 4, "depth": 75, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 75, "PG": "B", "safetyStop": false}, {"time": 11, "depth": 75, "PG": "C", "safetyStop": false}, {"time": 12, "depth": 75, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 75, "PG": "E", "safetyStop": false}, {"time": 15, "depth": 75, "PG": "F", "safetyStop": false}, {"time": 16, "depth": 75, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 75, "PG": "H", "safetyStop": false}, {"time": 19, "depth": 75, "PG": "I", "safetyStop": false}, {"time": 20, "depth": 75, "PG": "J", "safetyStop": false}, {"time": 22, "depth": 75, "PG": "K", "safetyStop": false}, {"time": 23, "depth": 75, "PG": "L", "safetyStop": false}, {"time": 25, "depth": 75, "PG": "M", "safetyStop": false}, {"time": 26, "depth": 75, "PG": "N", "safetyStop": false}, {"time": 28, "depth": 75, "PG": "O", "safetyStop": false}, {"time": 30, "depth": 75, "PG": "P", "safetyStop": true}, {"time": 31, "depth": 75, "PG": "Q", "safetyStop": true}, {"time": 33, "depth": 75, "PG": "R", "safetyStop": true}, {"time": 35, "depth": 75, "PG": "S", "safetyStop": true}],
// "80": [{"time": 4, "depth": 80, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 80, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 80, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 80, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 80, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 80, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 80, "PG": "G", "safetyStop": false}, {"time": 17, "depth": 80, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 80, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 80, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 80, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 80, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 80, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 80, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 80, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 80, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 80, "PG": "Q", "safetyStop": true}, {"time": 30, "depth": 80, "PG": "R", "safetyStop": true}],
// "85": [{"time": 4, "depth": 85, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 85, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 85, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 85, "PG": "D", "safetyStop": false}, {"time": 12, "depth": 85, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 85, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 85, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 85, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 85, "PG": "I", "safetyStop": false}, {"time": 18, "depth": 85, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 85, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 85, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 85, "PG": "M", "safetyStop": false}, {"time": 23, "depth": 85, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 85, "PG": "O", "safetyStop": true}, {"time": 25, "depth": 85, "PG": "P", "safetyStop": true}, {"time": 27, "depth": 85, "PG": "Q", "safetyStop": true}],
// "90": [{"time": 4, "depth": 90, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 90, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 90, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 90, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 90, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 90, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 90, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 90, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 90, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 90, "PG": "J", "safetyStop": false}, {"time": 18, "depth": 90, "PG": "K", "safetyStop": false}, {"time": 19, "depth": 90, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 90, "PG": "M", "safetyStop": false}, {"time": 22, "depth": 90, "PG": "N", "safetyStop": true}, {"time": 23, "depth": 90, "PG": "O", "safetyStop": true}, {"time": 24, "depth": 90, "PG": "P", "safetyStop": true}, {"time": 25, "depth": 90, "PG": "Q", "safetyStop": true}],
// "95": [{"time": 3, "depth": 95, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 95, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 95, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 95, "PG": "D", "safetyStop": false}, {"time": 10, "depth": 95, "PG": "E", "safetyStop": false}, {"time": 11, "depth": 95, "PG": "F", "safetyStop": false}, {"time": 12, "depth": 95, "PG": "G", "safetyStop": false}, {"time": 13, "depth": 95, "PG": "H", "safetyStop": false}, {"time": 14, "depth": 95, "PG": "I", "safetyStop": false}, {"time": 15, "depth": 95, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 95, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 95, "PG": "L", "safetyStop": false}, {"time": 19, "depth": 95, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 95, "PG": "N", "safetyStop": true}, {"time": 21, "depth": 95, "PG": "O", "safetyStop": true}, {"time": 22, "depth": 95, "PG": "P", "safetyStop": true}], 
// "100": [{"time": 3, "depth": 100, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 100, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 100, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 100, "PG": "D", "safetyStop": false}, {"time": 10, "depth": 100, "PG": "E", "safetyStop": false}, {"time": 11, "depth": 100, "PG": "F", "safetyStop": false}, {"time": 12, "depth": 100, "PG": "G", "safetyStop": false}, {"time": 13, "depth": 100, "PG": "H", "safetyStop": false}, {"time": 14, "depth": 100, "PG": "I", "safetyStop": false}, {"time": 15, "depth": 100, "PG": "J", "safetyStop": false}, {"time": 16, "depth": 100, "PG": "K", "safetyStop": false}, {"time": 17, "depth": 100, "PG": "L", "safetyStop": true}, {"time": 18, "depth": 100, "PG": "M", "safetyStop": true}, {"time": 19, "depth": 100, "PG": "N", "safetyStop": true}, {"time": 20, "depth": 100, "PG": "O", "safetyStop": true}], 
// "110": [{"time": 3, "depth": 110, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 110, "PG": "B", "safetyStop": false}, {"time": 7, "depth": 110, "PG": "C", "safetyStop": false}, {"time": 8, "depth": 110, "PG": "D", "safetyStop": false}, {"time": 9, "depth": 110, "PG": "E", "safetyStop": false}, {"time": 10, "depth": 110, "PG": "F", "safetyStop": false}, {"time": 11, "depth": 110, "PG": "G", "safetyStop": false}, {"time": 12, "depth": 110, "PG": "H", "safetyStop": false}, {"time": 13, "depth": 110, "PG": "I", "safetyStop": false}, {"time": 0, "depth": 110, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 110, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 110, "PG": "L", "safetyStop": true}, {"time": 16, "depth": 110, "PG": "M", "safetyStop": true}], 
// "120": [{"time": 3, "depth": 120, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 120, "PG": "B", "safetyStop": false}, {"time": 6, "depth": 120, "PG": "C", "safetyStop": false}, {"time": 7, "depth": 120, "PG": "D", "safetyStop": false}, {"time": 8, "depth": 120, "PG": "E", "safetyStop": false}, {"time": 9, "depth": 120, "PG": "F", "safetyStop": false}, {"time": 10, "depth": 120, "PG": "G", "safetyStop": false}, {"time": 11, "depth": 120, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 120, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 120, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 120, "PG": "K", "safetyStop": true}], 
// "130": [{"time": 3, "depth": 130, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 130, "PG": "B", "safetyStop": false}, {"time": 6, "depth": 130, "PG": "C", "safetyStop": false}, {"time": 7, "depth": 130, "PG": "D", "safetyStop": false}, {"time": 0, "depth": 130, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 130, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 130, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 130, "PG": "H", "safetyStop": true}], 
// "140": [{"time": 0, "depth": 140, "PG": "A", "safetyStop": false}, {"time": 4, "depth": 140, "PG": "B", "safetyStop": false}, {"time": 5, "depth": 140, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 140, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 140, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 140, "PG": "F", "safetyStop": true}]};



NDLTableFT = 
    {"35": 205, "40": 140, "45": 100, "50": 80, "55": 65, "60": 55, "65": 45, "70": 40, "75": 35, "80": 30, "85": 27, "90": 25, "95": 22, "100": 20, "110": 16, "120": 13, "130": 10, "140": 9};

DepthTableM = //[LMNT 20150604]: New auto populated table based on Padi's Table 1. Changed "arrow" values
{
"10": [{"time": 10, "depth": 10, "PG": "A", "safetyStop": false}, {"time": 20, "depth": 10, "PG": "B", "safetyStop": false}, {"time": 26, "depth": 10, "PG": "C", "safetyStop": false}, {"time": 30, "depth": 10, "PG": "D", "safetyStop": false}, {"time": 34, "depth": 10, "PG": "E", "safetyStop": false}, {"time": 37, "depth": 10, "PG": "F", "safetyStop": false}, {"time": 41, "depth": 10, "PG": "G", "safetyStop": false}, {"time": 45, "depth": 10, "PG": "H", "safetyStop": false}, {"time": 50, "depth": 10, "PG": "I", "safetyStop": false}, {"time": 54, "depth": 10, "PG": "J", "safetyStop": false}, {"time": 59, "depth": 10, "PG": "K", "safetyStop": false}, {"time": 64, "depth": 10, "PG": "L", "safetyStop": false}, {"time": 70, "depth": 10, "PG": "M", "safetyStop": false}, {"time": 75, "depth": 10, "PG": "N", "safetyStop": false}, {"time": 82, "depth": 10, "PG": "O", "safetyStop": false}, {"time": 88, "depth": 10, "PG": "P", "safetyStop": false}, {"time": 95, "depth": 10, "PG": "Q", "safetyStop": false}, {"time": 104, "depth": 10, "PG": "R", "safetyStop": false}, {"time": 112, "depth": 10, "PG": "S", "safetyStop": false}, {"time": 122, "depth": 10, "PG": "T", "safetyStop": false}, {"time": 133, "depth": 10, "PG": "U", "safetyStop": false}, {"time": 145, "depth": 10, "PG": "V", "safetyStop": false}, {"time": 160, "depth": 10, "PG": "W", "safetyStop": true}, {"time": 178, "depth": 10, "PG": "X", "safetyStop": true}, {"time": 199, "depth": 10, "PG": "Y", "safetyStop": true}, {"time": 219, "depth": 10, "PG": "Z", "safetyStop": true}],
"12": [{"time": 9, "depth": 12, "PG": "A", "safetyStop": false}, {"time": 17, "depth": 12, "PG": "B", "safetyStop": false}, {"time": 23, "depth": 12, "PG": "C", "safetyStop": false}, {"time": 26, "depth": 12, "PG": "D", "safetyStop": false}, {"time": 29, "depth": 12, "PG": "E", "safetyStop": false}, {"time": 32, "depth": 12, "PG": "F", "safetyStop": false}, {"time": 35, "depth": 12, "PG": "G", "safetyStop": false}, {"time": 38, "depth": 12, "PG": "H", "safetyStop": false}, {"time": 42, "depth": 12, "PG": "I", "safetyStop": false}, {"time": 45, "depth": 12, "PG": "J", "safetyStop": false}, {"time": 49, "depth": 12, "PG": "K", "safetyStop": false}, {"time": 53, "depth": 12, "PG": "L", "safetyStop": false}, {"time": 57, "depth": 12, "PG": "M", "safetyStop": false}, {"time": 62, "depth": 12, "PG": "N", "safetyStop": false}, {"time": 66, "depth": 12, "PG": "O", "safetyStop": false}, {"time": 71, "depth": 12, "PG": "P", "safetyStop": false}, {"time": 76, "depth": 12, "PG": "Q", "safetyStop": false}, {"time": 82, "depth": 12, "PG": "R", "safetyStop": false}, {"time": 88, "depth": 12, "PG": "S", "safetyStop": false}, {"time": 94, "depth": 12, "PG": "T", "safetyStop": false}, {"time": 101, "depth": 12, "PG": "U", "safetyStop": false}, {"time": 108, "depth": 12, "PG": "V", "safetyStop": false}, {"time": 116, "depth": 12, "PG": "W", "safetyStop": true}, {"time": 125, "depth": 12, "PG": "X", "safetyStop": true}, {"time": 134, "depth": 12, "PG": "Y", "safetyStop": true}, {"time": 147, "depth": 12, "PG": "Z", "safetyStop": true}],
"14": [{"time": 8, "depth": 14, "PG": "A", "safetyStop": false}, {"time": 15, "depth": 14, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 14, "PG": "C", "safetyStop": false}, {"time": 22, "depth": 14, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 14, "PG": "E", "safetyStop": false}, {"time": 27, "depth": 14, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 14, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 14, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 14, "PG": "I", "safetyStop": false}, {"time": 37, "depth": 14, "PG": "J", "safetyStop": false}, {"time": 40, "depth": 14, "PG": "K", "safetyStop": false}, {"time": 43, "depth": 14, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 14, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 14, "PG": "N", "safetyStop": false}, {"time": 53, "depth": 14, "PG": "O", "safetyStop": false}, {"time": 57, "depth": 14, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 14, "PG": "Q", "safetyStop": false}, {"time": 64, "depth": 14, "PG": "R", "safetyStop": false}, {"time": 68, "depth": 14, "PG": "S", "safetyStop": false}, {"time": 73, "depth": 14, "PG": "T", "safetyStop": false}, {"time": 77, "depth": 14, "PG": "U", "safetyStop": false}, {"time": 82, "depth": 14, "PG": "V", "safetyStop": true}, {"time": 87, "depth": 14, "PG": "W", "safetyStop": true}, {"time": 92, "depth": 14, "PG": "X", "safetyStop": true}, {"time": 98, "depth": 14, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 14, "PG": "Z", "safetyStop": true}],
"16": [{"time": 7, "depth": 16, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 16, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 16, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 16, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 16, "PG": "E", "safetyStop": false}, {"time": 23, "depth": 16, "PG": "F", "safetyStop": false}, {"time": 25, "depth": 16, "PG": "G", "safetyStop": false}, {"time": 27, "depth": 16, "PG": "H", "safetyStop": false}, {"time": 29, "depth": 16, "PG": "I", "safetyStop": false}, {"time": 32, "depth": 16, "PG": "J", "safetyStop": false}, {"time": 34, "depth": 16, "PG": "K", "safetyStop": false}, {"time": 37, "depth": 16, "PG": "L", "safetyStop": false}, {"time": 39, "depth": 16, "PG": "M", "safetyStop": false}, {"time": 42, "depth": 16, "PG": "N", "safetyStop": false}, {"time": 45, "depth": 16, "PG": "O", "safetyStop": false}, {"time": 48, "depth": 16, "PG": "P", "safetyStop": false}, {"time": 50, "depth": 16, "PG": "Q", "safetyStop": false}, {"time": 53, "depth": 16, "PG": "R", "safetyStop": false}, {"time": 56, "depth": 16, "PG": "S", "safetyStop": false}, {"time": 60, "depth": 16, "PG": "T", "safetyStop": false}, {"time": 63, "depth": 16, "PG": "U", "safetyStop": true}, {"time": 67, "depth": 16, "PG": "V", "safetyStop": true}, {"time": 70, "depth": 16, "PG": "W", "safetyStop": true}, {"time": 72, "depth": 16, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 16, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 16, "PG": "Z", "safetyStop": true}],
"18": [{"time": 6, "depth": 18, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 18, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 18, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 18, "PG": "D", "safetyStop": false}, {"time": 18, "depth": 18, "PG": "E", "safetyStop": false}, {"time": 20, "depth": 18, "PG": "F", "safetyStop": false}, {"time": 22, "depth": 18, "PG": "G", "safetyStop": false}, {"time": 24, "depth": 18, "PG": "H", "safetyStop": false}, {"time": 26, "depth": 18, "PG": "I", "safetyStop": false}, {"time": 28, "depth": 18, "PG": "J", "safetyStop": false}, {"time": 30, "depth": 18, "PG": "K", "safetyStop": false}, {"time": 32, "depth": 18, "PG": "L", "safetyStop": false}, {"time": 34, "depth": 18, "PG": "M", "safetyStop": false}, {"time": 36, "depth": 18, "PG": "N", "safetyStop": false}, {"time": 39, "depth": 18, "PG": "O", "safetyStop": false}, {"time": 41, "depth": 18, "PG": "P", "safetyStop": false}, {"time": 43, "depth": 18, "PG": "Q", "safetyStop": false}, {"time": 46, "depth": 18, "PG": "R", "safetyStop": false}, {"time": 48, "depth": 18, "PG": "S", "safetyStop": false}, {"time": 51, "depth": 18, "PG": "T", "safetyStop": true}, {"time": 53, "depth": 18, "PG": "U", "safetyStop": true}, {"time": 55, "depth": 18, "PG": "V", "safetyStop": true}, {"time": 56, "depth": 18, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "Z", "safetyStop": true}],
"20": [{"time": 6, "depth": 20, "PG": "A", "safetyStop": false}, {"time": 10, "depth": 20, "PG": "B", "safetyStop": false}, {"time": 13, "depth": 20, "PG": "C", "safetyStop": false}, {"time": 15, "depth": 20, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 20, "PG": "E", "safetyStop": false}, {"time": 18, "depth": 20, "PG": "F", "safetyStop": false}, {"time": 20, "depth": 20, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 20, "PG": "H", "safetyStop": false}, {"time": 23, "depth": 20, "PG": "I", "safetyStop": false}, {"time": 25, "depth": 20, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 20, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 20, "PG": "L", "safetyStop": false}, {"time": 30, "depth": 20, "PG": "M", "safetyStop": false}, {"time": 32, "depth": 20, "PG": "N", "safetyStop": false}, {"time": 34, "depth": 20, "PG": "O", "safetyStop": false}, {"time": 36, "depth": 20, "PG": "P", "safetyStop": false}, {"time": 38, "depth": 20, "PG": "Q", "safetyStop": false}, {"time": 40, "depth": 20, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 20, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 20, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 20, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "Z", "safetyStop": true}],
"22": [{"time": 5, "depth": 22, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 22, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 22, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 22, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 22, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 22, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 22, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 22, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 22, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 22, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 22, "PG": "K", "safetyStop": false}, {"time": 25, "depth": 22, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 22, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 22, "PG": "N", "safetyStop": false}, {"time": 30, "depth": 22, "PG": "O", "safetyStop": false}, {"time": 32, "depth": 22, "PG": "P", "safetyStop": true}, {"time": 34, "depth": 22, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 22, "PG": "R", "safetyStop": true}, {"time": 37, "depth": 22, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "Z", "safetyStop": true}],
"24": [{"time": 4, "depth": 24, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 24, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 24, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 24, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 24, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 24, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 24, "PG": "G", "safetyStop": false}, {"time": 16, "depth": 24, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 24, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 24, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 24, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 24, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 24, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 24, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 24, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 24, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 24, "PG": "Q", "safetyStop": true}, {"time": 31, "depth": 24, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "Z", "safetyStop": true}],
"26": [{"time": 4, "depth": 26, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 26, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 26, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 26, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 26, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 26, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 26, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 26, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 26, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 26, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 26, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 26, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 26, "PG": "M", "safetyStop": true}, {"time": 23, "depth": 26, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 26, "PG": "O", "safetyStop": true}, {"time": 27, "depth": 26, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Z", "safetyStop": true}],
"28": [{"time": 3, "depth": 28, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 28, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 28, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 28, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 28, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 28, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 28, "PG": "G", "safetyStop": false}, {"time": 14, "depth": 28, "PG": "H", "safetyStop": false}, {"time": 15, "depth": 28, "PG": "I", "safetyStop": false}, {"time": 16, "depth": 28, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 28, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 28, "PG": "L", "safetyStop": true}, {"time": 20, "depth": 28, "PG": "M", "safetyStop": true}, {"time": 21, "depth": 28, "PG": "N", "safetyStop": true}, {"time": 23, "depth": 28, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Z", "safetyStop": true}],
"30": [{"time": 3, "depth": 30, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 30, "PG": "B", "safetyStop": true}, {"time": 8, "depth": 30, "PG": "C", "safetyStop": true}, {"time": 9, "depth": 30, "PG": "D", "safetyStop": true}, {"time": 10, "depth": 30, "PG": "E", "safetyStop": true}, {"time": 11, "depth": 30, "PG": "F", "safetyStop": true}, {"time": 12, "depth": 30, "PG": "G", "safetyStop": true}, {"time": 13, "depth": 30, "PG": "H", "safetyStop": true}, {"time": 14, "depth": 30, "PG": "I", "safetyStop": true}, {"time": 15, "depth": 30, "PG": "J", "safetyStop": true}, {"time": 16, "depth": 30, "PG": "K", "safetyStop": true}, {"time": 17, "depth": 30, "PG": "L", "safetyStop": true}, {"time": 19, "depth": 30, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 30, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Z", "safetyStop": true}],
"32": [{"time": 3, "depth": 32, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 32, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 32, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 32, "PG": "D", "safetyStop": true}, {"time": 9, "depth": 32, "PG": "E", "safetyStop": true}, {"time": 10, "depth": 32, "PG": "F", "safetyStop": true}, {"time": 11, "depth": 32, "PG": "G", "safetyStop": true}, {"time": 12, "depth": 32, "PG": "H", "safetyStop": true}, {"time": 13, "depth": 32, "PG": "I", "safetyStop": true}, {"time": 14, "depth": 32, "PG": "J", "safetyStop": true}, {"time": 15, "depth": 32, "PG": "K", "safetyStop": true}, {"time": 16, "depth": 32, "PG": "L", "safetyStop": true}, {"time": 17, "depth": 32, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Z", "safetyStop": true}],
"34": [{"time": 3, "depth": 34, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 34, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 34, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 34, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 34, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 34, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 34, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 34, "PG": "H", "safetyStop": true}, {"time": 12, "depth": 34, "PG": "I", "safetyStop": true}, {"time": 13, "depth": 34, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 34, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 34, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Z", "safetyStop": true}],
"36": [{"time": 2, "depth": 36, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 36, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 36, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 36, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 36, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 36, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 36, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 36, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 36, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 36, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 36, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Z", "safetyStop": true}],
"38": [{"time": 2, "depth": 38, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 38, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 38, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 38, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 38, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 38, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 38, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 38, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 38, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Z", "safetyStop": true}],
"40": [{"time": 0, "depth": 40, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 40, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 40, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 40, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 40, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 40, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 40, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Z", "safetyStop": true}],
"42": [{"time": 0, "depth": 42, "PG": "A", "safetyStop": true}, {"time": 4, "depth": 42, "PG": "B", "safetyStop": true}, {"time": 4, "depth": 42, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 42, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 42, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 42, "PG": "F", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Z", "safetyStop": true}],

};
// DepthTableM = //[LMNT 20150603]: New auto populated table based on Padi's Table 1
// {
// "10": [{"time": 10, "depth": 10, "PG": "A", "safetyStop": false}, {"time": 20, "depth": 10, "PG": "B", "safetyStop": false}, {"time": 26, "depth": 10, "PG": "C", "safetyStop": false}, {"time": 30, "depth": 10, "PG": "D", "safetyStop": false}, {"time": 34, "depth": 10, "PG": "E", "safetyStop": false}, {"time": 37, "depth": 10, "PG": "F", "safetyStop": false}, {"time": 41, "depth": 10, "PG": "G", "safetyStop": false}, {"time": 45, "depth": 10, "PG": "H", "safetyStop": false}, {"time": 50, "depth": 10, "PG": "I", "safetyStop": false}, {"time": 54, "depth": 10, "PG": "J", "safetyStop": false}, {"time": 59, "depth": 10, "PG": "K", "safetyStop": false}, {"time": 64, "depth": 10, "PG": "L", "safetyStop": false}, {"time": 70, "depth": 10, "PG": "M", "safetyStop": false}, {"time": 75, "depth": 10, "PG": "N", "safetyStop": false}, {"time": 82, "depth": 10, "PG": "O", "safetyStop": false}, {"time": 88, "depth": 10, "PG": "P", "safetyStop": false}, {"time": 95, "depth": 10, "PG": "Q", "safetyStop": false}, {"time": 104, "depth": 10, "PG": "R", "safetyStop": false}, {"time": 112, "depth": 10, "PG": "S", "safetyStop": false}, {"time": 122, "depth": 10, "PG": "T", "safetyStop": false}, {"time": 133, "depth": 10, "PG": "U", "safetyStop": false}, {"time": 145, "depth": 10, "PG": "V", "safetyStop": false}, {"time": 160, "depth": 10, "PG": "W", "safetyStop": true}, {"time": 178, "depth": 10, "PG": "X", "safetyStop": true}, {"time": 199, "depth": 10, "PG": "Y", "safetyStop": true}, {"time": 219, "depth": 10, "PG": "Z", "safetyStop": true}],
// "12": [{"time": 9, "depth": 12, "PG": "A", "safetyStop": false}, {"time": 17, "depth": 12, "PG": "B", "safetyStop": false}, {"time": 23, "depth": 12, "PG": "C", "safetyStop": false}, {"time": 26, "depth": 12, "PG": "D", "safetyStop": false}, {"time": 29, "depth": 12, "PG": "E", "safetyStop": false}, {"time": 32, "depth": 12, "PG": "F", "safetyStop": false}, {"time": 35, "depth": 12, "PG": "G", "safetyStop": false}, {"time": 38, "depth": 12, "PG": "H", "safetyStop": false}, {"time": 42, "depth": 12, "PG": "I", "safetyStop": false}, {"time": 45, "depth": 12, "PG": "J", "safetyStop": false}, {"time": 49, "depth": 12, "PG": "K", "safetyStop": false}, {"time": 53, "depth": 12, "PG": "L", "safetyStop": false}, {"time": 57, "depth": 12, "PG": "M", "safetyStop": false}, {"time": 62, "depth": 12, "PG": "N", "safetyStop": false}, {"time": 66, "depth": 12, "PG": "O", "safetyStop": false}, {"time": 71, "depth": 12, "PG": "P", "safetyStop": false}, {"time": 76, "depth": 12, "PG": "Q", "safetyStop": false}, {"time": 82, "depth": 12, "PG": "R", "safetyStop": false}, {"time": 88, "depth": 12, "PG": "S", "safetyStop": false}, {"time": 94, "depth": 12, "PG": "T", "safetyStop": false}, {"time": 101, "depth": 12, "PG": "U", "safetyStop": false}, {"time": 108, "depth": 12, "PG": "V", "safetyStop": false}, {"time": 116, "depth": 12, "PG": "W", "safetyStop": true}, {"time": 125, "depth": 12, "PG": "X", "safetyStop": true}, {"time": 134, "depth": 12, "PG": "Y", "safetyStop": true}, {"time": 147, "depth": 12, "PG": "Z", "safetyStop": true}],
// "14": [{"time": 8, "depth": 14, "PG": "A", "safetyStop": false}, {"time": 15, "depth": 14, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 14, "PG": "C", "safetyStop": false}, {"time": 22, "depth": 14, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 14, "PG": "E", "safetyStop": false}, {"time": 27, "depth": 14, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 14, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 14, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 14, "PG": "I", "safetyStop": false}, {"time": 37, "depth": 14, "PG": "J", "safetyStop": false}, {"time": 40, "depth": 14, "PG": "K", "safetyStop": false}, {"time": 43, "depth": 14, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 14, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 14, "PG": "N", "safetyStop": false}, {"time": 53, "depth": 14, "PG": "O", "safetyStop": false}, {"time": 57, "depth": 14, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 14, "PG": "Q", "safetyStop": false}, {"time": 64, "depth": 14, "PG": "R", "safetyStop": false}, {"time": 68, "depth": 14, "PG": "S", "safetyStop": false}, {"time": 73, "depth": 14, "PG": "T", "safetyStop": false}, {"time": 77, "depth": 14, "PG": "U", "safetyStop": false}, {"time": 82, "depth": 14, "PG": "V", "safetyStop": true}, {"time": 87, "depth": 14, "PG": "W", "safetyStop": true}, {"time": 92, "depth": 14, "PG": "X", "safetyStop": true}, {"time": 98, "depth": 14, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 14, "PG": "Z", "safetyStop": true}],
// "16": [{"time": 7, "depth": 16, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 16, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 16, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 16, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 16, "PG": "E", "safetyStop": false}, {"time": 23, "depth": 16, "PG": "F", "safetyStop": false}, {"time": 25, "depth": 16, "PG": "G", "safetyStop": false}, {"time": 27, "depth": 16, "PG": "H", "safetyStop": false}, {"time": 29, "depth": 16, "PG": "I", "safetyStop": false}, {"time": 32, "depth": 16, "PG": "J", "safetyStop": false}, {"time": 34, "depth": 16, "PG": "K", "safetyStop": false}, {"time": 37, "depth": 16, "PG": "L", "safetyStop": false}, {"time": 39, "depth": 16, "PG": "M", "safetyStop": false}, {"time": 42, "depth": 16, "PG": "N", "safetyStop": false}, {"time": 45, "depth": 16, "PG": "O", "safetyStop": false}, {"time": 48, "depth": 16, "PG": "P", "safetyStop": false}, {"time": 50, "depth": 16, "PG": "Q", "safetyStop": false}, {"time": 53, "depth": 16, "PG": "R", "safetyStop": false}, {"time": 56, "depth": 16, "PG": "S", "safetyStop": false}, {"time": 60, "depth": 16, "PG": "T", "safetyStop": false}, {"time": 63, "depth": 16, "PG": "U", "safetyStop": true}, {"time": 67, "depth": 16, "PG": "V", "safetyStop": true}, {"time": 70, "depth": 16, "PG": "W", "safetyStop": true}, {"time": 72, "depth": 16, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 16, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 16, "PG": "Z", "safetyStop": true}],
// "18": [{"time": 6, "depth": 18, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 18, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 18, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 18, "PG": "D", "safetyStop": false}, {"time": 18, "depth": 18, "PG": "E", "safetyStop": false}, {"time": 20, "depth": 18, "PG": "F", "safetyStop": false}, {"time": 22, "depth": 18, "PG": "G", "safetyStop": false}, {"time": 24, "depth": 18, "PG": "H", "safetyStop": false}, {"time": 26, "depth": 18, "PG": "I", "safetyStop": false}, {"time": 28, "depth": 18, "PG": "J", "safetyStop": false}, {"time": 30, "depth": 18, "PG": "K", "safetyStop": false}, {"time": 32, "depth": 18, "PG": "L", "safetyStop": false}, {"time": 34, "depth": 18, "PG": "M", "safetyStop": false}, {"time": 36, "depth": 18, "PG": "N", "safetyStop": false}, {"time": 39, "depth": 18, "PG": "O", "safetyStop": false}, {"time": 41, "depth": 18, "PG": "P", "safetyStop": false}, {"time": 43, "depth": 18, "PG": "Q", "safetyStop": false}, {"time": 46, "depth": 18, "PG": "R", "safetyStop": false}, {"time": 48, "depth": 18, "PG": "S", "safetyStop": false}, {"time": 51, "depth": 18, "PG": "T", "safetyStop": true}, {"time": 53, "depth": 18, "PG": "U", "safetyStop": true}, {"time": 55, "depth": 18, "PG": "V", "safetyStop": true}, {"time": 56, "depth": 18, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 18, "PG": "Z", "safetyStop": true}],
// "20": [{"time": 6, "depth": 20, "PG": "A", "safetyStop": false}, {"time": 10, "depth": 20, "PG": "B", "safetyStop": false}, {"time": 13, "depth": 20, "PG": "C", "safetyStop": false}, {"time": 15, "depth": 20, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 20, "PG": "E", "safetyStop": false}, {"time": 18, "depth": 20, "PG": "F", "safetyStop": false}, {"time": 20, "depth": 20, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 20, "PG": "H", "safetyStop": false}, {"time": 23, "depth": 20, "PG": "I", "safetyStop": false}, {"time": 25, "depth": 20, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 20, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 20, "PG": "L", "safetyStop": false}, {"time": 30, "depth": 20, "PG": "M", "safetyStop": false}, {"time": 32, "depth": 20, "PG": "N", "safetyStop": false}, {"time": 34, "depth": 20, "PG": "O", "safetyStop": false}, {"time": 36, "depth": 20, "PG": "P", "safetyStop": false}, {"time": 38, "depth": 20, "PG": "Q", "safetyStop": false}, {"time": 40, "depth": 20, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 20, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 20, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 20, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 20, "PG": "Z", "safetyStop": true}],
// "22": [{"time": 5, "depth": 22, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 22, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 22, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 22, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 22, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 22, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 22, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 22, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 22, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 22, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 22, "PG": "K", "safetyStop": false}, {"time": 25, "depth": 22, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 22, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 22, "PG": "N", "safetyStop": false}, {"time": 30, "depth": 22, "PG": "O", "safetyStop": false}, {"time": 32, "depth": 22, "PG": "P", "safetyStop": true}, {"time": 34, "depth": 22, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 22, "PG": "R", "safetyStop": true}, {"time": 37, "depth": 22, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 22, "PG": "Z", "safetyStop": true}],
// "24": [{"time": 4, "depth": 24, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 24, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 24, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 24, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 24, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 24, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 24, "PG": "G", "safetyStop": false}, {"time": 16, "depth": 24, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 24, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 24, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 24, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 24, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 24, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 24, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 24, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 24, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 24, "PG": "Q", "safetyStop": true}, {"time": 31, "depth": 24, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 24, "PG": "Z", "safetyStop": true}],
// "26": [{"time": 4, "depth": 26, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 26, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 26, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 26, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 26, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 26, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 26, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 26, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 26, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 26, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 26, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 26, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 26, "PG": "M", "safetyStop": true}, {"time": 23, "depth": 26, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 26, "PG": "O", "safetyStop": true}, {"time": 25, "depth": 26, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 26, "PG": "Z", "safetyStop": true}],
// "28": [{"time": 3, "depth": 28, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 28, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 28, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 28, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 28, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 28, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 28, "PG": "G", "safetyStop": false}, {"time": 14, "depth": 28, "PG": "H", "safetyStop": false}, {"time": 15, "depth": 28, "PG": "I", "safetyStop": false}, {"time": 16, "depth": 28, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 28, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 28, "PG": "L", "safetyStop": true}, {"time": 20, "depth": 28, "PG": "M", "safetyStop": true}, {"time": 21, "depth": 28, "PG": "N", "safetyStop": true}, {"time": 22, "depth": 28, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 28, "PG": "Z", "safetyStop": true}],
// "30": [{"time": 3, "depth": 30, "PG": "A", "safetyStop": true}, {"time": 6, "depth": 30, "PG": "B", "safetyStop": true}, {"time": 8, "depth": 30, "PG": "C", "safetyStop": true}, {"time": 9, "depth": 30, "PG": "D", "safetyStop": true}, {"time": 10, "depth": 30, "PG": "E", "safetyStop": true}, {"time": 11, "depth": 30, "PG": "F", "safetyStop": true}, {"time": 12, "depth": 30, "PG": "G", "safetyStop": true}, {"time": 13, "depth": 30, "PG": "H", "safetyStop": true}, {"time": 14, "depth": 30, "PG": "I", "safetyStop": true}, {"time": 15, "depth": 30, "PG": "J", "safetyStop": true}, {"time": 16, "depth": 30, "PG": "K", "safetyStop": true}, {"time": 17, "depth": 30, "PG": "L", "safetyStop": true}, {"time": 19, "depth": 30, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 30, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 30, "PG": "Z", "safetyStop": true}],
// "32": [{"time": 3, "depth": 32, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 32, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 32, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 32, "PG": "D", "safetyStop": true}, {"time": 9, "depth": 32, "PG": "E", "safetyStop": true}, {"time": 10, "depth": 32, "PG": "F", "safetyStop": true}, {"time": 11, "depth": 32, "PG": "G", "safetyStop": true}, {"time": 12, "depth": 32, "PG": "H", "safetyStop": true}, {"time": 13, "depth": 32, "PG": "I", "safetyStop": true}, {"time": 14, "depth": 32, "PG": "J", "safetyStop": true}, {"time": 15, "depth": 32, "PG": "K", "safetyStop": true}, {"time": 16, "depth": 32, "PG": "L", "safetyStop": true}, {"time": 17, "depth": 32, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 32, "PG": "Z", "safetyStop": true}],
// "34": [{"time": 3, "depth": 34, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 34, "PG": "B", "safetyStop": true}, {"time": 7, "depth": 34, "PG": "C", "safetyStop": true}, {"time": 8, "depth": 34, "PG": "D", "safetyStop": true}, {"time": 9, "depth": 34, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 34, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 34, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 34, "PG": "H", "safetyStop": true}, {"time": 12, "depth": 34, "PG": "I", "safetyStop": true}, {"time": 13, "depth": 34, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 34, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 34, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 34, "PG": "Z", "safetyStop": true}],
// "36": [{"time": 2, "depth": 36, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 36, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 36, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 36, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 36, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 36, "PG": "F", "safetyStop": true}, {"time": 10, "depth": 36, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 36, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 36, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 36, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 36, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 36, "PG": "Z", "safetyStop": true}],
// "38": [{"time": 2, "depth": 38, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 38, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 38, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 38, "PG": "D", "safetyStop": true}, {"time": 8, "depth": 38, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 38, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 38, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 38, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 38, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 38, "PG": "Z", "safetyStop": true}],
// "40": [{"time": 5, "depth": 40, "PG": "A", "safetyStop": true}, {"time": 5, "depth": 40, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 40, "PG": "C", "safetyStop": true}, {"time": 7, "depth": 40, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 40, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 40, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 40, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 40, "PG": "Z", "safetyStop": true}],
// "42": [{"time": 4, "depth": 42, "PG": "A", "safetyStop": true}, {"time": 4, "depth": 42, "PG": "B", "safetyStop": true}, {"time": 6, "depth": 42, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 42, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 42, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 42, "PG": "F", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "G", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "H", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "I", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "J", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "K", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "L", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "M", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "N", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "O", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "P", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Q", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "R", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "S", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "T", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "U", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "V", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "W", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "X", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Y", "safetyStop": true}, {"time": 0, "depth": 42, "PG": "Z", "safetyStop": true}],
// };

// DepthTableM = //[LMNT 20150603]: Original Table based on Padi's Table 3
// {
// "10": [{"time": 10, "depth": 10, "PG": "A", "safetyStop": false}, {"time": 20, "depth": 10, "PG": "B", "safetyStop": false}, {"time": 26, "depth": 10, "PG": "C", "safetyStop": false}, {"time": 30, "depth": 10, "PG": "D", "safetyStop": false}, {"time": 34, "depth": 10, "PG": "E", "safetyStop": false}, {"time": 37, "depth": 10, "PG": "F", "safetyStop": false}, {"time": 41, "depth": 10, "PG": "G", "safetyStop": false}, {"time": 45, "depth": 10, "PG": "H", "safetyStop": false}, {"time": 50, "depth": 10, "PG": "I", "safetyStop": false}, {"time": 54, "depth": 10, "PG": "J", "safetyStop": false}, {"time": 59, "depth": 10, "PG": "K", "safetyStop": false}, {"time": 64, "depth": 10, "PG": "L", "safetyStop": false}, {"time": 70, "depth": 10, "PG": "M", "safetyStop": false}, {"time": 75, "depth": 10, "PG": "N", "safetyStop": false}, {"time": 82, "depth": 10, "PG": "O", "safetyStop": false}, {"time": 88, "depth": 10, "PG": "P", "safetyStop": false}, {"time": 95, "depth": 10, "PG": "Q", "safetyStop": false}, {"time": 104, "depth": 10, "PG": "R", "safetyStop": false}, {"time": 112, "depth": 10, "PG": "S", "safetyStop": false}, {"time": 122, "depth": 10, "PG": "T", "safetyStop": false}, {"time": 133, "depth": 10, "PG": "U", "safetyStop": false}, {"time": 145, "depth": 10, "PG": "V", "safetyStop": false}, {"time": 160, "depth": 10, "PG": "W", "safetyStop": true}, {"time": 178, "depth": 10, "PG": "X", "safetyStop": true}, {"time": 199, "depth": 10, "PG": "Y", "safetyStop": true}, {"time": 219, "depth": 10, "PG": "Z", "safetyStop": true}], 
// "12": [{"time": 9, "depth": 12, "PG": "A", "safetyStop": false}, {"time": 17, "depth": 12, "PG": "B", "safetyStop": false}, {"time": 23, "depth": 12, "PG": "C", "safetyStop": false}, {"time": 26, "depth": 12, "PG": "D", "safetyStop": false}, {"time": 29, "depth": 12, "PG": "E", "safetyStop": false}, {"time": 32, "depth": 12, "PG": "F", "safetyStop": false}, {"time": 35, "depth": 12, "PG": "G", "safetyStop": false}, {"time": 38, "depth": 12, "PG": "H", "safetyStop": false}, {"time": 42, "depth": 12, "PG": "I", "safetyStop": false}, {"time": 45, "depth": 12, "PG": "J", "safetyStop": false}, {"time": 49, "depth": 12, "PG": "K", "safetyStop": false}, {"time": 53, "depth": 12, "PG": "L", "safetyStop": false}, {"time": 57, "depth": 12, "PG": "M", "safetyStop": false}, {"time": 62, "depth": 12, "PG": "N", "safetyStop": false}, {"time": 66, "depth": 12, "PG": "O", "safetyStop": false}, {"time": 71, "depth": 12, "PG": "P", "safetyStop": false}, {"time": 76, "depth": 12, "PG": "Q", "safetyStop": false}, {"time": 82, "depth": 12, "PG": "R", "safetyStop": false}, {"time": 88, "depth": 12, "PG": "S", "safetyStop": false}, {"time": 94, "depth": 12, "PG": "T", "safetyStop": false}, {"time": 101, "depth": 12, "PG": "U", "safetyStop": false}, {"time": 108, "depth": 12, "PG": "V", "safetyStop": false}, {"time": 116, "depth": 12, "PG": "W", "safetyStop": true}, {"time": 125, "depth": 12, "PG": "X", "safetyStop": true}, {"time": 134, "depth": 12, "PG": "Y", "safetyStop": true}, {"time": 147, "depth": 12, "PG": "Z", "safetyStop": true}], 
// "14": [{"time": 8, "depth": 14, "PG": "A", "safetyStop": false}, {"time": 15, "depth": 14, "PG": "B", "safetyStop": false}, {"time": 19, "depth": 14, "PG": "C", "safetyStop": false}, {"time": 22, "depth": 14, "PG": "D", "safetyStop": false}, {"time": 24, "depth": 14, "PG": "E", "safetyStop": false}, {"time": 27, "depth": 14, "PG": "F", "safetyStop": false}, {"time": 29, "depth": 14, "PG": "G", "safetyStop": false}, {"time": 32, "depth": 14, "PG": "H", "safetyStop": false}, {"time": 35, "depth": 14, "PG": "I", "safetyStop": false}, {"time": 37, "depth": 14, "PG": "J", "safetyStop": false}, {"time": 40, "depth": 14, "PG": "K", "safetyStop": false}, {"time": 43, "depth": 14, "PG": "L", "safetyStop": false}, {"time": 47, "depth": 14, "PG": "M", "safetyStop": false}, {"time": 50, "depth": 14, "PG": "N", "safetyStop": false}, {"time": 53, "depth": 14, "PG": "O", "safetyStop": false}, {"time": 57, "depth": 14, "PG": "P", "safetyStop": false}, {"time": 61, "depth": 14, "PG": "Q", "safetyStop": false}, {"time": 64, "depth": 14, "PG": "R", "safetyStop": false}, {"time": 68, "depth": 14, "PG": "S", "safetyStop": false}, {"time": 73, "depth": 14, "PG": "T", "safetyStop": false}, {"time": 77, "depth": 14, "PG": "U", "safetyStop": false}, {"time": 82, "depth": 14, "PG": "V", "safetyStop": true}, {"time": 87, "depth": 14, "PG": "W", "safetyStop": true}, {"time": 92, "depth": 14, "PG": "X", "safetyStop": true}, {"time": 98, "depth": 14, "PG": "Y", "safetyStop": true}], 
// "16": [{"time": 7, "depth": 16, "PG": "A", "safetyStop": false}, {"time": 13, "depth": 16, "PG": "B", "safetyStop": false}, {"time": 17, "depth": 16, "PG": "C", "safetyStop": false}, {"time": 19, "depth": 16, "PG": "D", "safetyStop": false}, {"time": 21, "depth": 16, "PG": "E", "safetyStop": false}, {"time": 23, "depth": 16, "PG": "F", "safetyStop": false}, {"time": 25, "depth": 16, "PG": "G", "safetyStop": false}, {"time": 27, "depth": 16, "PG": "H", "safetyStop": false}, {"time": 29, "depth": 16, "PG": "I", "safetyStop": false}, {"time": 32, "depth": 16, "PG": "J", "safetyStop": false}, {"time": 34, "depth": 16, "PG": "K", "safetyStop": false}, {"time": 37, "depth": 16, "PG": "L", "safetyStop": false}, {"time": 39, "depth": 16, "PG": "M", "safetyStop": false}, {"time": 42, "depth": 16, "PG": "N", "safetyStop": false}, {"time": 45, "depth": 16, "PG": "O", "safetyStop": false}, {"time": 48, "depth": 16, "PG": "P", "safetyStop": false}, {"time": 50, "depth": 16, "PG": "Q", "safetyStop": false}, {"time": 53, "depth": 16, "PG": "R", "safetyStop": false}, {"time": 56, "depth": 16, "PG": "S", "safetyStop": false}, {"time": 60, "depth": 16, "PG": "T", "safetyStop": false}, {"time": 63, "depth": 16, "PG": "U", "safetyStop": true}, {"time": 67, "depth": 16, "PG": "V", "safetyStop": true}, {"time": 70, "depth": 16, "PG": "W", "safetyStop": true}, {"time": 72, "depth": 16, "PG": "X", "safetyStop": true}], 
// "18": [{"time": 6, "depth": 18, "PG": "A", "safetyStop": false}, {"time": 11, "depth": 18, "PG": "B", "safetyStop": false}, {"time": 15, "depth": 18, "PG": "C", "safetyStop": false}, {"time": 16, "depth": 18, "PG": "D", "safetyStop": false}, {"time": 18, "depth": 18, "PG": "E", "safetyStop": false}, {"time": 20, "depth": 18, "PG": "F", "safetyStop": false}, {"time": 22, "depth": 18, "PG": "G", "safetyStop": false}, {"time": 24, "depth": 18, "PG": "H", "safetyStop": false}, {"time": 26, "depth": 18, "PG": "I", "safetyStop": false}, {"time": 28, "depth": 18, "PG": "J", "safetyStop": false}, {"time": 30, "depth": 18, "PG": "K", "safetyStop": false}, {"time": 32, "depth": 18, "PG": "L", "safetyStop": false}, {"time": 34, "depth": 18, "PG": "M", "safetyStop": false}, {"time": 36, "depth": 18, "PG": "N", "safetyStop": false}, {"time": 39, "depth": 18, "PG": "O", "safetyStop": false}, {"time": 41, "depth": 18, "PG": "P", "safetyStop": false}, {"time": 43, "depth": 18, "PG": "Q", "safetyStop": false}, {"time": 46, "depth": 18, "PG": "R", "safetyStop": false}, {"time": 48, "depth": 18, "PG": "S", "safetyStop": false}, {"time": 51, "depth": 18, "PG": "T", "safetyStop": true}, {"time": 53, "depth": 18, "PG": "U", "safetyStop": true}, {"time": 55, "depth": 18, "PG": "V", "safetyStop": true}, {"time": 56, "depth": 18, "PG": "W", "safetyStop": true}], 
// "20": [{"time": 6, "depth": 20, "PG": "A", "safetyStop": false}, {"time": 10, "depth": 20, "PG": "B", "safetyStop": false}, {"time": 13, "depth": 20, "PG": "C", "safetyStop": false}, {"time": 15, "depth": 20, "PG": "D", "safetyStop": false}, {"time": 16, "depth": 20, "PG": "E", "safetyStop": false}, {"time": 18, "depth": 20, "PG": "F", "safetyStop": false}, {"time": 20, "depth": 20, "PG": "G", "safetyStop": false}, {"time": 21, "depth": 20, "PG": "H", "safetyStop": false}, {"time": 23, "depth": 20, "PG": "I", "safetyStop": false}, {"time": 25, "depth": 20, "PG": "J", "safetyStop": false}, {"time": 26, "depth": 20, "PG": "K", "safetyStop": false}, {"time": 28, "depth": 20, "PG": "L", "safetyStop": false}, {"time": 30, "depth": 20, "PG": "M", "safetyStop": false}, {"time": 32, "depth": 20, "PG": "N", "safetyStop": false}, {"time": 34, "depth": 20, "PG": "O", "safetyStop": false}, {"time": 36, "depth": 20, "PG": "P", "safetyStop": false}, {"time": 38, "depth": 20, "PG": "Q", "safetyStop": false}, {"time": 40, "depth": 20, "PG": "R", "safetyStop": true}, {"time": 42, "depth": 20, "PG": "S", "safetyStop": true}, {"time": 44, "depth": 20, "PG": "T", "safetyStop": true}, {"time": 45, "depth": 20, "PG": "U", "safetyStop": true}], 
// "22": [{"time": 5, "depth": 22, "PG": "A", "safetyStop": false}, {"time": 9, "depth": 22, "PG": "B", "safetyStop": false}, {"time": 12, "depth": 22, "PG": "C", "safetyStop": false}, {"time": 13, "depth": 22, "PG": "D", "safetyStop": false}, {"time": 15, "depth": 22, "PG": "E", "safetyStop": false}, {"time": 16, "depth": 22, "PG": "F", "safetyStop": false}, {"time": 18, "depth": 22, "PG": "G", "safetyStop": false}, {"time": 19, "depth": 22, "PG": "H", "safetyStop": false}, {"time": 21, "depth": 22, "PG": "I", "safetyStop": false}, {"time": 22, "depth": 22, "PG": "J", "safetyStop": false}, {"time": 24, "depth": 22, "PG": "K", "safetyStop": false}, {"time": 25, "depth": 22, "PG": "L", "safetyStop": false}, {"time": 27, "depth": 22, "PG": "M", "safetyStop": false}, {"time": 29, "depth": 22, "PG": "N", "safetyStop": false}, {"time": 30, "depth": 22, "PG": "O", "safetyStop": false}, {"time": 32, "depth": 22, "PG": "P", "safetyStop": true}, {"time": 34, "depth": 22, "PG": "Q", "safetyStop": true}, {"time": 36, "depth": 22, "PG": "R", "safetyStop": true}, {"time": 37, "depth": 22, "PG": "S", "safetyStop": true}], 
// "24": [{"time": 4, "depth": 24, "PG": "A", "safetyStop": false}, {"time": 8, "depth": 24, "PG": "B", "safetyStop": false}, {"time": 10, "depth": 24, "PG": "C", "safetyStop": false}, {"time": 11, "depth": 24, "PG": "D", "safetyStop": false}, {"time": 13, "depth": 24, "PG": "E", "safetyStop": false}, {"time": 14, "depth": 24, "PG": "F", "safetyStop": false}, {"time": 15, "depth": 24, "PG": "G", "safetyStop": false}, {"time": 16, "depth": 24, "PG": "H", "safetyStop": false}, {"time": 18, "depth": 24, "PG": "I", "safetyStop": false}, {"time": 19, "depth": 24, "PG": "J", "safetyStop": false}, {"time": 21, "depth": 24, "PG": "K", "safetyStop": false}, {"time": 22, "depth": 24, "PG": "L", "safetyStop": false}, {"time": 23, "depth": 24, "PG": "M", "safetyStop": false}, {"time": 25, "depth": 24, "PG": "N", "safetyStop": false}, {"time": 26, "depth": 24, "PG": "O", "safetyStop": true}, {"time": 28, "depth": 24, "PG": "P", "safetyStop": true}, {"time": 29, "depth": 24, "PG": "Q", "safetyStop": true}, {"time": 31, "depth": 24, "PG": "R", "safetyStop": true}], 
// "26": [{"time": 4, "depth": 26, "PG": "A", "safetyStop": false}, {"time": 7, "depth": 26, "PG": "B", "safetyStop": false}, {"time": 9, "depth": 26, "PG": "C", "safetyStop": false}, {"time": 10, "depth": 26, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 26, "PG": "E", "safetyStop": false}, {"time": 13, "depth": 26, "PG": "F", "safetyStop": false}, {"time": 14, "depth": 26, "PG": "G", "safetyStop": false}, {"time": 15, "depth": 26, "PG": "H", "safetyStop": false}, {"time": 16, "depth": 26, "PG": "I", "safetyStop": false}, {"time": 17, "depth": 26, "PG": "J", "safetyStop": false}, {"time": 19, "depth": 26, "PG": "K", "safetyStop": false}, {"time": 20, "depth": 26, "PG": "L", "safetyStop": false}, {"time": 21, "depth": 26, "PG": "M", "safetyStop": true}, {"time": 23, "depth": 26, "PG": "N", "safetyStop": true}, {"time": 24, "depth": 26, "PG": "O", "safetyStop": true}, {"time": 27, "depth": 26, "PG": "P", "safetyStop": true}], 
// "28": [{"time": 3, "depth": 28, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 28, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 28, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 28, "PG": "D", "safetyStop": false}, {"time": 11, "depth": 28, "PG": "E", "safetyStop": false}, {"time": 12, "depth": 28, "PG": "F", "safetyStop": false}, {"time": 13, "depth": 28, "PG": "G", "safetyStop": false}, {"time": 14, "depth": 28, "PG": "H", "safetyStop": false}, {"time": 15, "depth": 28, "PG": "I", "safetyStop": false}, {"time": 16, "depth": 28, "PG": "J", "safetyStop": false}, {"time": 17, "depth": 28, "PG": "K", "safetyStop": false}, {"time": 18, "depth": 28, "PG": "L", "safetyStop": true}, {"time": 20, "depth": 28, "PG": "M", "safetyStop": true}, {"time": 21, "depth": 28, "PG": "N", "safetyStop": true}, {"time": 23, "depth": 28, "PG": "O", "safetyStop": true}], 
// "30": [{"time": 3, "depth": 30, "PG": "A", "safetyStop": false}, {"time": 6, "depth": 30, "PG": "B", "safetyStop": false}, {"time": 8, "depth": 30, "PG": "C", "safetyStop": false}, {"time": 9, "depth": 30, "PG": "D", "safetyStop": false}, {"time": 10, "depth": 30, "PG": "E", "safetyStop": false}, {"time": 11, "depth": 30, "PG": "F", "safetyStop": false}, {"time": 12, "depth": 30, "PG": "G", "safetyStop": false}, {"time": 13, "depth": 30, "PG": "H", "safetyStop": false}, {"time": 14, "depth": 30, "PG": "I", "safetyStop": false}, {"time": 15, "depth": 30, "PG": "J", "safetyStop": false}, {"time": 16, "depth": 30, "PG": "K", "safetyStop": true}, {"time": 17, "depth": 30, "PG": "L", "safetyStop": true}, {"time": 19, "depth": 30, "PG": "M", "safetyStop": true}, {"time": 20, "depth": 30, "PG": "N", "safetyStop": true}], 
// "32": [{"time": 3, "depth": 32, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 32, "PG": "B", "safetyStop": false}, {"time": 7, "depth": 32, "PG": "C", "safetyStop": false}, {"time": 8, "depth": 32, "PG": "D", "safetyStop": false}, {"time": 9, "depth": 32, "PG": "E", "safetyStop": false}, {"time": 10, "depth": 32, "PG": "F", "safetyStop": false}, {"time": 11, "depth": 32, "PG": "G", "safetyStop": false}, {"time": 12, "depth": 32, "PG": "H", "safetyStop": false}, {"time": 13, "depth": 32, "PG": "I", "safetyStop": false}, {"time": 14, "depth": 32, "PG": "J", "safetyStop": true}, {"time": 15, "depth": 32, "PG": "K", "safetyStop": true}, {"time": 16, "depth": 32, "PG": "L", "safetyStop": true}, {"time": 17, "depth": 32, "PG": "M", "safetyStop": true}], 
// "34": [{"time": 3, "depth": 34, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 34, "PG": "B", "safetyStop": false}, {"time": 7, "depth": 34, "PG": "C", "safetyStop": false}, {"time": 8, "depth": 34, "PG": "D", "safetyStop": false}, {"time": 9, "depth": 34, "PG": "F", "safetyStop": false}, {"time": 10, "depth": 34, "PG": "G", "safetyStop": false}, {"time": 11, "depth": 34, "PG": "H", "safetyStop": false}, {"time": 12, "depth": 34, "PG": "I", "safetyStop": true}, {"time": 13, "depth": 34, "PG": "J", "safetyStop": true}, {"time": 14, "depth": 34, "PG": "K", "safetyStop": true}, {"time": 15, "depth": 34, "PG": "L", "safetyStop": true}], 
// "36": [{"time": 2, "depth": 36, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 36, "PG": "B", "safetyStop": false}, {"time": 6, "depth": 36, "PG": "C", "safetyStop": false}, {"time": 7, "depth": 36, "PG": "D", "safetyStop": false}, {"time": 8, "depth": 36, "PG": "E", "safetyStop": false}, {"time": 9, "depth": 36, "PG": "F", "safetyStop": false}, {"time": 10, "depth": 36, "PG": "G", "safetyStop": true}, {"time": 11, "depth": 36, "PG": "I", "safetyStop": true}, {"time": 12, "depth": 36, "PG": "J", "safetyStop": true}, {"time": 13, "depth": 36, "PG": "K", "safetyStop": true}], 
// "38": [{"time": 2, "depth": 38, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 38, "PG": "B", "safetyStop": false}, {"time": 6, "depth": 38, "PG": "C", "safetyStop": false}, {"time": 7, "depth": 38, "PG": "D", "safetyStop": false}, {"time": 8, "depth": 38, "PG": "E", "safetyStop": true}, {"time": 9, "depth": 38, "PG": "G", "safetyStop": true}, {"time": 10, "depth": 38, "PG": "H", "safetyStop": true}, {"time": 11, "depth": 38, "PG": "I", "safetyStop": true}], 
// "40": [{"time": 0, "depth": 40, "PG": "A", "safetyStop": false}, {"time": 5, "depth": 40, "PG": "B", "safetyStop": false}, {"time": 6, "depth": 40, "PG": "C", "safetyStop": false}, {"time": 0, "depth": 40, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 40, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 40, "PG": "F", "safetyStop": true}, {"time": 9, "depth": 40, "PG": "G", "safetyStop": true}], 
// "42": [{"time": 0, "depth": 42, "PG": "A", "safetyStop": false}, {"time": 4, "depth": 42, "PG": "B", "safetyStop": false}, {"time": 0, "depth": 42, "PG": "C", "safetyStop": true}, {"time": 6, "depth": 42, "PG": "D", "safetyStop": true}, {"time": 7, "depth": 42, "PG": "E", "safetyStop": true}, {"time": 8, "depth": 42, "PG": "F", "safetyStop": true}]}


NDLTableM = 
{"10": 219, "12": 147, "14": 98, "16": 72, "18": 56, "20": 45, "22": 37, "24": 31, "26": 27, "28": 23, "30": 20, "32": 17, "34": 15, "36": 13, "38": 11, "40": 9, "42": 8}

SITable = 
{
"A": [{"min": 0, "PG1": "A", "PG2": "A"}, {"min": 181, "PG1": "A", "PG2": "-1"}], 
"B": [{"min": 0, "PG1": "B", "PG2": "B"}, {"min": 48, "PG1": "B", "PG2": "A"}, {"min": 229, "PG1": "B", "PG2": "-1"}], 
"C": [{"min": 0, "PG1": "C", "PG2": "C"}, {"min": 22, "PG1": "C", "PG2": "B"}, {"min": 70, "PG1": "C", "PG2": "A"}, {"min": 251, "PG1": "C", "PG2": "-1"}], 
"D": [{"min": 0, "PG1": "D", "PG2": "D"}, {"min": 9, "PG1": "D", "PG2": "C"}, {"min": 31, "PG1": "D", "PG2": "B"}, {"min": 79, "PG1": "D", "PG2": "A"}, {"min": 260, "PG1": "D", "PG2": "-1"}], 
"E": [{"min": 0, "PG1": "E", "PG2": "E"}, {"min": 8, "PG1": "E", "PG2": "D"}, {"min": 17, "PG1": "E", "PG2": "C"}, {"min": 39, "PG1": "E", "PG2": "B"}, {"min": 88, "PG1": "E", "PG2": "A"}, {"min": 269, "PG1": "E", "PG2": "-1"}], 
"F": [{"min": 0, "PG1": "F", "PG2": "F"}, {"min": 8, "PG1": "F", "PG2": "E"}, {"min": 16, "PG1": "F", "PG2": "D"}, {"min": 25, "PG1": "F", "PG2": "C"}, {"min": 47, "PG1": "F", "PG2": "B"}, {"min": 95, "PG1": "F", "PG2": "A"}, {"min": 276, "PG1": "F", "PG2": "-1"}], 
"G": [{"min": 0, "PG1": "G", "PG2": "G"}, {"min": 7, "PG1": "G", "PG2": "F"}, {"min": 14, "PG1": "G", "PG2": "E"}, {"min": 23, "PG1": "G", "PG2": "D"}, {"min": 32, "PG1": "G", "PG2": "C"}, {"min": 54, "PG1": "G", "PG2": "B"}, {"min": 102, "PG1": "G", "PG2": "A"}, {"min": 283, "PG1": "G", "PG2": "-1"}], 
"H": [{"min": 0, "PG1": "H", "PG2": "H"}, {"min": 6, "PG1": "H", "PG2": "G"}, {"min": 13, "PG1": "H", "PG2": "F"}, {"min": 21, "PG1": "H", "PG2": "E"}, {"min": 29, "PG1": "H", "PG2": "D"}, {"min": 38, "PG1": "H", "PG2": "C"}, {"min": 60, "PG1": "H", "PG2": "B"}, {"min": 108, "PG1": "H", "PG2": "A"}, {"min": 289, "PG1": "H", "PG2": "-1"}], 
"I": [{"min": 0, "PG1": "I", "PG2": "I"}, {"min": 6, "PG1": "I", "PG2": "H"}, {"min": 12, "PG1": "I", "PG2": "G"}, {"min": 19, "PG1": "I", "PG2": "F"}, {"min": 27, "PG1": "I", "PG2": "E"}, {"min": 35, "PG1": "I", "PG2": "D"}, {"min": 44, "PG1": "I", "PG2": "C"}, {"min": 66, "PG1": "I", "PG2": "B"}, {"min": 114, "PG1": "I", "PG2": "A"}, {"min": 295, "PG1": "I", "PG2": "-1"}], 
"J": [{"min": 0, "PG1": "J", "PG2": "J"}, {"min": 6, "PG1": "J", "PG2": "I"}, {"min": 12, "PG1": "J", "PG2": "H"}, {"min": 18, "PG1": "J", "PG2": "G"}, {"min": 25, "PG1": "J", "PG2": "F"}, {"min": 32, "PG1": "J", "PG2": "E"}, {"min": 41, "PG1": "J", "PG2": "D"}, {"min": 50, "PG1": "J", "PG2": "C"}, {"min": 72, "PG1": "J", "PG2": "B"}, {"min": 120, "PG1": "J", "PG2": "A"}, {"min": 301, "PG1": "J", "PG2": "-1"}], 
"K": [{"min": 0, "PG1": "K", "PG2": "K"}, {"min": 5, "PG1": "K", "PG2": "J"}, {"min": 11, "PG1": "K", "PG2": "I"}, {"min": 17, "PG1": "K", "PG2": "H"}, {"min": 23, "PG1": "K", "PG2": "G"}, {"min": 30, "PG1": "K", "PG2": "F"}, {"min": 38, "PG1": "K", "PG2": "E"}, {"min": 46, "PG1": "K", "PG2": "D"}, {"min": 55, "PG1": "K", "PG2": "C"}, {"min": 77, "PG1": "K", "PG2": "B"}, {"min": 125, "PG1": "K", "PG2": "A"}, {"min": 306, "PG1": "K", "PG2": "-1"}], 
"L": [{"min": 0, "PG1": "L", "PG2": "L"}, {"min": 5, "PG1": "L", "PG2": "K"}, {"min": 10, "PG1": "L", "PG2": "J"}, {"min": 16, "PG1": "L", "PG2": "I"}, {"min": 22, "PG1": "L", "PG2": "H"}, {"min": 28, "PG1": "L", "PG2": "G"}, {"min": 35, "PG1": "L", "PG2": "F"}, {"min": 43, "PG1": "L", "PG2": "E"}, {"min": 51, "PG1": "L", "PG2": "D"}, {"min": 60, "PG1": "L", "PG2": "C"}, {"min": 82, "PG1": "L", "PG2": "B"}, {"min": 130, "PG1": "L", "PG2": "A"}, {"min": 311, "PG1": "L", "PG2": "-1"}], 
"M": [{"min": 0, "PG1": "M", "PG2": "M"}, {"min": 5, "PG1": "M", "PG2": "L"}, {"min": 10, "PG1": "M", "PG2": "K"}, {"min": 15, "PG1": "M", "PG2": "J"}, {"min": 20, "PG1": "M", "PG2": "I"}, {"min": 26, "PG1": "M", "PG2": "H"}, {"min": 33, "PG1": "M", "PG2": "G"}, {"min": 40, "PG1": "M", "PG2": "F"}, {"min": 47, "PG1": "M", "PG2": "E"}, {"min": 56, "PG1": "M", "PG2": "D"}, {"min": 65, "PG1": "M", "PG2": "C"}, {"min": 86, "PG1": "M", "PG2": "B"}, {"min": 135, "PG1": "M", "PG2": "A"}, {"min": 316, "PG1": "M", "PG2": "-1"}], 
"N": [{"min": 0, "PG1": "N", "PG2": "N"}, {"min": 4, "PG1": "N", "PG2": "M"}, {"min": 9, "PG1": "N", "PG2": "L"}, {"min": 14, "PG1": "N", "PG2": "K"}, {"min": 19, "PG1": "N", "PG2": "J"}, {"min": 25, "PG1": "N", "PG2": "I"}, {"min": 31, "PG1": "N", "PG2": "H"}, {"min": 37, "PG1": "N", "PG2": "G"}, {"min": 44, "PG1": "N", "PG2": "F"}, {"min": 52, "PG1": "N", "PG2": "E"}, {"min": 60, "PG1": "N", "PG2": "D"}, {"min": 69, "PG1": "N", "PG2": "C"}, {"min": 91, "PG1": "N", "PG2": "B"}, {"min": 139, "PG1": "N", "PG2": "A"}, {"min": 320, "PG1": "N", "PG2": "-1"}], 
"O": [{"min": 0, "PG1": "O", "PG2": "O"}, {"min": 4, "PG1": "O", "PG2": "N"}, {"min": 9, "PG1": "O", "PG2": "M"}, {"min": 13, "PG1": "O", "PG2": "L"}, {"min": 18, "PG1": "O", "PG2": "K"}, {"min": 24, "PG1": "O", "PG2": "J"}, {"min": 29, "PG1": "O", "PG2": "I"}, {"min": 35, "PG1": "O", "PG2": "H"}, {"min": 42, "PG1": "O", "PG2": "G"}, {"min": 48, "PG1": "O", "PG2": "F"}, {"min": 56, "PG1": "O", "PG2": "E"}, {"min": 64, "PG1": "O", "PG2": "D"}, {"min": 73, "PG1": "O", "PG2": "C"}, {"min": 95, "PG1": "O", "PG2": "B"}, {"min": 144, "PG1": "O", "PG2": "A"}, {"min": 325, "PG1": "O", "PG2": "-1"}], 
"P": [{"min": 0, "PG1": "P", "PG2": "P"}, {"min": 4, "PG1": "P", "PG2": "O"}, {"min": 8, "PG1": "P", "PG2": "N"}, {"min": 13, "PG1": "P", "PG2": "M"}, {"min": 17, "PG1": "P", "PG2": "L"}, {"min": 22, "PG1": "P", "PG2": "K"}, {"min": 28, "PG1": "P", "PG2": "J"}, {"min": 33, "PG1": "P", "PG2": "I"}, {"min": 39, "PG1": "P", "PG2": "H"}, {"min": 46, "PG1": "P", "PG2": "G"}, {"min": 52, "PG1": "P", "PG2": "F"}, {"min": 60, "PG1": "P", "PG2": "E"}, {"min": 68, "PG1": "P", "PG2": "D"}, {"min": 77, "PG1": "P", "PG2": "C"}, {"min": 99, "PG1": "P", "PG2": "B"}, {"min": 148, "PG1": "P", "PG2": "A"}, {"min": 329, "PG1": "P", "PG2": "-1"}], 
"Q": [{"min": 0, "PG1": "Q", "PG2": "Q"}, {"min": 4, "PG1": "Q", "PG2": "P"}, {"min": 8, "PG1": "Q", "PG2": "O"}, {"min": 12, "PG1": "Q", "PG2": "N"}, {"min": 17, "PG1": "Q", "PG2": "M"}, {"min": 21, "PG1": "Q", "PG2": "L"}, {"min": 26, "PG1": "Q", "PG2": "K"}, {"min": 31, "PG1": "Q", "PG2": "J"}, {"min": 37, "PG1": "Q", "PG2": "I"}, {"min": 43, "PG1": "Q", "PG2": "H"}, {"min": 49, "PG1": "Q", "PG2": "G"}, {"min": 56, "PG1": "Q", "PG2": "F"}, {"min": 64, "PG1": "Q", "PG2": "E"}, {"min": 72, "PG1": "Q", "PG2": "D"}, {"min": 81, "PG1": "Q", "PG2": "C"}, {"min": 103, "PG1": "Q", "PG2": "B"}, {"min": 151, "PG1": "Q", "PG2": "A"}, {"min": 332, "PG1": "Q", "PG2": "-1"}], 
"R": [{"min": 0, "PG1": "R", "PG2": "R"}, {"min": 4, "PG1": "R", "PG2": "Q"}, {"min": 8, "PG1": "R", "PG2": "P"}, {"min": 12, "PG1": "R", "PG2": "O"}, {"min": 16, "PG1": "R", "PG2": "N"}, {"min": 20, "PG1": "R", "PG2": "M"}, {"min": 25, "PG1": "R", "PG2": "L"}, {"min": 30, "PG1": "R", "PG2": "K"}, {"min": 35, "PG1": "R", "PG2": "J"}, {"min": 41, "PG1": "R", "PG2": "I"}, {"min": 47, "PG1": "R", "PG2": "H"}, {"min": 53, "PG1": "R", "PG2": "G"}, {"min": 60, "PG1": "R", "PG2": "F"}, {"min": 68, "PG1": "R", "PG2": "E"}, {"min": 76, "PG1": "R", "PG2": "D"}, {"min": 85, "PG1": "R", "PG2": "C"}, {"min": 107, "PG1": "R", "PG2": "B"}, {"min": 155, "PG1": "R", "PG2": "A"}, {"min": 336, "PG1": "R", "PG2": "-1"}], 
"S": [{"min": 0, "PG1": "S", "PG2": "S"}, {"min": 4, "PG1": "S", "PG2": "R"}, {"min": 7, "PG1": "S", "PG2": "Q"}, {"min": 11, "PG1": "S", "PG2": "P"}, {"min": 15, "PG1": "S", "PG2": "O"}, {"min": 19, "PG1": "S", "PG2": "N"}, {"min": 24, "PG1": "S", "PG2": "M"}, {"min": 28, "PG1": "S", "PG2": "L"}, {"min": 33, "PG1": "S", "PG2": "K"}, {"min": 39, "PG1": "S", "PG2": "J"}, {"min": 44, "PG1": "S", "PG2": "I"}, {"min": 50, "PG1": "S", "PG2": "H"}, {"min": 57, "PG1": "S", "PG2": "G"}, {"min": 64, "PG1": "S", "PG2": "F"}, {"min": 71, "PG1": "S", "PG2": "E"}, {"min": 79, "PG1": "S", "PG2": "D"}, {"min": 88, "PG1": "S", "PG2": "C"}, {"min": 110, "PG1": "S", "PG2": "B"}, {"min": 159, "PG1": "S", "PG2": "A"}, {"min": 340, "PG1": "S", "PG2": "-1"}], 
"T": [{"min": 0, "PG1": "T", "PG2": "T"}, {"min": 3, "PG1": "T", "PG2": "S"}, {"min": 7, "PG1": "T", "PG2": "R"}, {"min": 11, "PG1": "T", "PG2": "Q"}, {"min": 14, "PG1": "T", "PG2": "P"}, {"min": 18, "PG1": "T", "PG2": "O"}, {"min": 23, "PG1": "T", "PG2": "N"}, {"min": 27, "PG1": "T", "PG2": "M"}, {"min": 32, "PG1": "T", "PG2": "L"}, {"min": 37, "PG1": "T", "PG2": "K"}, {"min": 42, "PG1": "T", "PG2": "J"}, {"min": 48, "PG1": "T", "PG2": "I"}, {"min": 54, "PG1": "T", "PG2": "H"}, {"min": 60, "PG1": "T", "PG2": "G"}, {"min": 67, "PG1": "T", "PG2": "F"}, {"min": 74, "PG1": "T", "PG2": "E"}, {"min": 83, "PG1": "T", "PG2": "D"}, {"min": 92, "PG1": "T", "PG2": "C"}, {"min": 114, "PG1": "T", "PG2": "B"}, {"min": 162, "PG1": "T", "PG2": "A"}, {"min": 343, "PG1": "T", "PG2": "-1"}], 
"U": [{"min": 0, "PG1": "U", "PG2": "U"}, {"min": 3, "PG1": "U", "PG2": "T"}, {"min": 7, "PG1": "U", "PG2": "S"}, {"min": 10, "PG1": "U", "PG2": "R"}, {"min": 14, "PG1": "U", "PG2": "Q"}, {"min": 18, "PG1": "U", "PG2": "P"}, {"min": 22, "PG1": "U", "PG2": "O"}, {"min": 26, "PG1": "U", "PG2": "N"}, {"min": 30, "PG1": "U", "PG2": "M"}, {"min": 35, "PG1": "U", "PG2": "L"}, {"min": 40, "PG1": "U", "PG2": "K"}, {"min": 45, "PG1": "U", "PG2": "J"}, {"min": 51, "PG1": "U", "PG2": "I"}, {"min": 57, "PG1": "U", "PG2": "H"}, {"min": 63, "PG1": "U", "PG2": "G"}, {"min": 70, "PG1": "U", "PG2": "F"}, {"min": 78, "PG1": "U", "PG2": "E"}, {"min": 86, "PG1": "U", "PG2": "D"}, {"min": 95, "PG1": "U", "PG2": "C"}, {"min": 117, "PG1": "U", "PG2": "B"}, {"min": 165, "PG1": "U", "PG2": "A"}, {"min": 346, "PG1": "U", "PG2": "-1"}], 
"V": [{"min": 0, "PG1": "V", "PG2": "V"}, {"min": 3, "PG1": "V", "PG2": "U"}, {"min": 6, "PG1": "V", "PG2": "T"}, {"min": 10, "PG1": "V", "PG2": "S"}, {"min": 13, "PG1": "V", "PG2": "R"}, {"min": 17, "PG1": "V", "PG2": "Q"}, {"min": 21, "PG1": "V", "PG2": "P"}, {"min": 25, "PG1": "V", "PG2": "O"}, {"min": 29, "PG1": "V", "PG2": "N"}, {"min": 34, "PG1": "V", "PG2": "M"}, {"min": 38, "PG1": "V", "PG2": "L"}, {"min": 43, "PG1": "V", "PG2": "K"}, {"min": 48, "PG1": "V", "PG2": "J"}, {"min": 54, "PG1": "V", "PG2": "I"}, {"min": 60, "PG1": "V", "PG2": "H"}, {"min": 66, "PG1": "V", "PG2": "G"}, {"min": 73, "PG1": "V", "PG2": "F"}, {"min": 81, "PG1": "V", "PG2": "E"}, {"min": 89, "PG1": "V", "PG2": "D"}, {"min": 98, "PG1": "V", "PG2": "C"}, {"min": 120, "PG1": "V", "PG2": "B"}, {"min": 168, "PG1": "V", "PG2": "A"}, {"min": 349, "PG1": "V", "PG2": "-1"}], 
"W": [{"min": 0, "PG1": "W", "PG2": "W"}, {"min": 3, "PG1": "W", "PG2": "V"}, {"min": 6, "PG1": "W", "PG2": "U"}, {"min": 9, "PG1": "W", "PG2": "T"}, {"min": 13, "PG1": "W", "PG2": "S"}, {"min": 16, "PG1": "W", "PG2": "R"}, {"min": 20, "PG1": "W", "PG2": "Q"}, {"min": 24, "PG1": "W", "PG2": "P"}, {"min": 28, "PG1": "W", "PG2": "O"}, {"min": 32, "PG1": "W", "PG2": "N"}, {"min": 37, "PG1": "W", "PG2": "M"}, {"min": 41, "PG1": "W", "PG2": "L"}, {"min": 46, "PG1": "W", "PG2": "K"}, {"min": 51, "PG1": "W", "PG2": "J"}, {"min": 57, "PG1": "W", "PG2": "I"}, {"min": 63, "PG1": "W", "PG2": "H"}, {"min": 69, "PG1": "W", "PG2": "G"}, {"min": 76, "PG1": "W", "PG2": "F"}, {"min": 84, "PG1": "W", "PG2": "E"}, {"min": 92, "PG1": "W", "PG2": "D"}, {"min": 101, "PG1": "W", "PG2": "C"}, {"min": 123, "PG1": "W", "PG2": "B"}, {"min": 171, "PG1": "W", "PG2": "A"}, {"min": 352, "PG1": "W", "PG2": "-1"}], 
"X": [{"min": 0, "PG1": "X", "PG2": "X"}, {"min": 3, "PG1": "X", "PG2": "W"}, {"min": 6, "PG1": "X", "PG2": "V"}, {"min": 9, "PG1": "X", "PG2": "U"}, {"min": 12, "PG1": "X", "PG2": "T"}, {"min": 16, "PG1": "X", "PG2": "S"}, {"min": 19, "PG1": "X", "PG2": "R"}, {"min": 23, "PG1": "X", "PG2": "Q"}, {"min": 27, "PG1": "X", "PG2": "P"}, {"min": 31, "PG1": "X", "PG2": "O"}, {"min": 35, "PG1": "X", "PG2": "N"}, {"min": 40, "PG1": "X", "PG2": "M"}, {"min": 44, "PG1": "X", "PG2": "L"}, {"min": 49, "PG1": "X", "PG2": "K"}, {"min": 54, "PG1": "X", "PG2": "J"}, {"min": 60, "PG1": "X", "PG2": "I"}, {"min": 66, "PG1": "X", "PG2": "H"}, {"min": 72, "PG1": "X", "PG2": "G"}, {"min": 79, "PG1": "X", "PG2": "F"}, {"min": 87, "PG1": "X", "PG2": "E"}, {"min": 95, "PG1": "X", "PG2": "D"}, {"min": 104, "PG1": "X", "PG2": "C"}, {"min": 126, "PG1": "X", "PG2": "B"}, {"min": 174, "PG1": "X", "PG2": "A"}, {"min": 355, "PG1": "X", "PG2": "-1"}], 
"Y": [{"min": 0, "PG1": "Y", "PG2": "Y"}, {"min": 3, "PG1": "Y", "PG2": "X"}, {"min": 6, "PG1": "Y", "PG2": "W"}, {"min": 9, "PG1": "Y", "PG2": "V"}, {"min": 12, "PG1": "Y", "PG2": "U"}, {"min": 15, "PG1": "Y", "PG2": "T"}, {"min": 19, "PG1": "Y", "PG2": "S"}, {"min": 22, "PG1": "Y", "PG2": "R"}, {"min": 26, "PG1": "Y", "PG2": "Q"}, {"min": 30, "PG1": "Y", "PG2": "P"}, {"min": 34, "PG1": "Y", "PG2": "O"}, {"min": 38, "PG1": "Y", "PG2": "N"}, {"min": 42, "PG1": "Y", "PG2": "M"}, {"min": 47, "PG1": "Y", "PG2": "L"}, {"min": 52, "PG1": "Y", "PG2": "K"}, {"min": 57, "PG1": "Y", "PG2": "J"}, {"min": 63, "PG1": "Y", "PG2": "I"}, {"min": 69, "PG1": "Y", "PG2": "H"}, {"min": 75, "PG1": "Y", "PG2": "G"}, {"min": 82, "PG1": "Y", "PG2": "F"}, {"min": 90, "PG1": "Y", "PG2": "E"}, {"min": 98, "PG1": "Y", "PG2": "D"}, {"min": 107, "PG1": "Y", "PG2": "C"}, {"min": 129, "PG1": "Y", "PG2": "B"}, {"min": 177, "PG1": "Y", "PG2": "A"}, {"min": 358, "PG1": "Y", "PG2": "-1"}], 
"Z": [{"min": 0, "PG1": "Z", "PG2": "Z"}, {"min": 3, "PG1": "Z", "PG2": "Y"}, {"min": 6, "PG1": "Z", "PG2": "X"}, {"min": 9, "PG1": "Z", "PG2": "W"}, {"min": 12, "PG1": "Z", "PG2": "V"}, {"min": 15, "PG1": "Z", "PG2": "U"}, {"min": 18, "PG1": "Z", "PG2": "T"}, {"min": 21, "PG1": "Z", "PG2": "S"}, {"min": 25, "PG1": "Z", "PG2": "R"}, {"min": 29, "PG1": "Z", "PG2": "Q"}, {"min": 32, "PG1": "Z", "PG2": "P"}, {"min": 36, "PG1": "Z", "PG2": "O"}, {"min": 41, "PG1": "Z", "PG2": "N"}, {"min": 45, "PG1": "Z", "PG2": "M"}, {"min": 50, "PG1": "Z", "PG2": "L"}, {"min": 55, "PG1": "Z", "PG2": "K"}, {"min": 60, "PG1": "Z", "PG2": "J"}, {"min": 66, "PG1": "Z", "PG2": "I"}, {"min": 72, "PG1": "Z", "PG2": "H"}, {"min": 78, "PG1": "Z", "PG2": "G"}, {"min": 85, "PG1": "Z", "PG2": "F"}, {"min": 92, "PG1": "Z", "PG2": "E"}, {"min": 101, "PG1": "Z", "PG2": "D"}, {"min": 110, "PG1": "Z", "PG2": "C"}, {"min": 132, "PG1": "Z", "PG2": "B"}, {"min": 180, "PG1": "Z", "PG2": "A"}, {"min": 361, "PG1": "Z", "PG2": "-1"}]};
    


////////
// Menu functions

var menuRetainCount = {};

function showMenu(menu_id, source){
    if (typeof(menuRetainCount[menu_id]) == 'number' && source != 'click'){
        document.getElementById(menu_id).style.visibility = 'visible';
        menuRetainCount[menu_id] += 1;
    } else {
        menuRetainCount[menu_id] = 1;
        document.getElementById(menu_id).style.visibility = 'visible';
    }
}

function hideMenu(menu_id){
    if (typeof(menuRetainCount[menu_id]) == 'number'){
        menuRetainCount[menu_id] -= 1;
        if (menuRetainCount[menu_id] <= 0){
            document.getElementById(menu_id).style.visibility = 'hidden';
        }
    } else {
        document.getElementById(menu_id).style.visibility = 'hidden';
    }
}

var showRules = false;
function toggleRules(){
    if (!showRules)
        document.getElementById('rules').style.visibility = 'visible';
    else
        document.getElementById('rules').style.visibility = 'hidden';
    showRules = !showRules;
}

function loadMenu(){
    document.getElementById('rules-button').onclick = function(){toggleRules()};

    document.getElementById('units-button').onclick = function(){showMenu('units-menu', 'click')};
    document.getElementById('units-button').onmouseout = function(){hideMenu('units-menu')};
    document.getElementById('units-menu').onmouseover = function(){showMenu('units-menu')};
    document.getElementById('units-menu').onmouseout = function(){hideMenu('units-menu')};
}


//test();
