const VERSION = 'v1.1';
const KEY = 'AAAAB3NzaC';

/* Generates pseudo-random UUID. Read this link, section 4.4 for more info
 * on pseudo-random UUIDs:
 * http://www.rfc-archive.org/getrfc.php?rfc=4122
 */
function guid() {
    let s4 = function(){
        const max = 0x10000;
        const val = (1 + Math.random()) * max;
        const asInt = Math.floor(val);
        const result = val.toString(16).substring(1);
        return result;
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function URLEncodeJSON(params){
    let result = '';
    for(strkey in params){
        const key = encodeURI(strkey);
        const val = encodeURI(params[strkey]);
        if(val === undefined || val === 'undefined')
            continue;
        if(result.indexOf('?') !== -1){
            result+='&' + key + '=' + val;
        }else{
            result+='?' + key + '=' + val;
        }
    }
    return result;
}

/* Gross get requests for JSON retrieval. In the future might want to use
   JQuery.
   */
function get(url, params){
    url += URLEncodeJSON(params);

    const HTTP_REQ = new XMLHttpRequest();
    HTTP_REQ.open('GET',url,false);//TODO make this asynchronous
    HTTP_REQ.send(null);
    return HTTP_REQ;
}

function post(url, params, file){
    const formData = new FormData();

    formData.append('zipfile',file);
    for(key in params){
        formData.append(key,params[key]);
    }

    const ENCODED = URLEncodeJSON(params);
    const HTTP_REQ = new XMLHttpRequest();
    HTTP_REQ.open('POST', url, false);
    HTTP_REQ.send(formData);
    return HTTP_REQ;
}

if(typeof(String.prototype.trim) === "undefined"){//In case of pre-IE9
    String.prototype.trim = function() {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

function Client(){
    const PROMPT = '[me]: ';

    let session = undefined;
    let lang = 'en';
    let chatbot_port = '8001';
    let chatbot_ip = 'localhost';
    let chatbot_url = 'http://' + chatbot_ip + ':' + chatbot_port + '/' + VERSION;
    let bot_name = 'sophia';
    let user = 'client';
    let self = this;

    this.write = function(msg){
        console.log(msg);
    };
    this.error = function(msg){
        console.error(msg);
    };//If we want to change the write function

    this.exit = function(){
        console.log("Exit");
    };
    //Callback to be set outside of the function.

    let finish_set_sid = function(response, callback){
        const text = response.responseText;
        const status_code = response.status;
        const json = JSON.parse(text);
        const ret = json['ret'];

        if(status_code != 200){
            write("Request error: " + status_code);
        }
        
        session = json['sid'];

        self.write("New session " + session);
        if(callback)
            callback();
    }

    this.set_sid = function(callback){
        const params = {
            'Auth': KEY,
            'botname': '' + bot_name,
            'user': user
        };

        const url = chatbot_url + '/start_session';

        self.write("Attempting to start new session.");

        let tries = 3;
        let loop = setInterval(function(){
            if(tries < 1){
                write("Failed to start new session.");

                if(callback)
                    callback();

                clearInterval(loop);
                return;
            }

            try{
                const attempt = get(url, params);
                finish_set_sid(attempt, callback);
                clearInterval(loop);
            }catch(e){
                tries--;
            }
        },1000);
    }

    this.ask = function(question){
        const params = {
            'question': '' + question,
            'session': session,
            'lang': lang,
            'Auth': KEY
        };
        console.log(params);

        const url = chatbot_url + '/chat';
        const response = get(url,params);
        const text = response.responseText;
        const status_code = response.status;
        const json = JSON.parse(text);
        const ret = json['ret'];

        console.log(json);

        if(status_code != 200){
            const err = "Request error: " + status_code + "\n";
            self.error(err);
        }

        if(ret != 0){
            const err = "QA error: error code " + ret + ", botname " + bot_name +
                ", question " + question + ", lang " + lang;
            self.error(err);
        }

        let result = {
            'text': '',
            'emotion': '',
            'botid': '',
            'botname': ''
        };

        for(key in json['response']){
            result[key] = json['response'][key];
        }

        return [ret, result];
    }

    this.list_chatbot = function(){
        const params = {
            'Auth':KEY,
            'lang':lang,
            'session': session
        };

        const response = get(chatbot_url + '/chatbots',params).responseText;
        const chatbots = JSON.parse(response)['response'];

        return chatbots;
    }
    
    this.list_chatbot_names = function(){
        const params = {
            'Auth':KEY,
            'lang':lang,
            'session':session
        };
        const response = get(chatbot_url + '/bot_names', params).responseText;
        const names = JSON.parse(response)['response'];
        
        return names;
    }

    this.default = function(line){
        if(!line)
            return;

        try{
            let ask = self.ask(line);
            let ret = ask[0];
            let response = ask[1];
            if(ret != 0){
                this.set_sid(function(){
                    ask = self.ask(line);
                    ret = ask[0];
                    response = ask[1];
                    const message = bot_name + '[by ' + response['botname'] + ']: ' + response['text'];
                    self.write(message);
                });
                return;
            }
            const message = bot_name + '[by ' + response['botname'] + ']: ' + response['text'];
            self.write(message);
        }catch(e){
            self.error(e);
        }
    }

    this.do_list = function(line){
        let chatbots = [];
        try{
            chatbots = self.list_chatbot();
            let chatbots_str = "";

            for(let idx = 0; idx < chatbots.length; idx++){
                const bot = chatbots[idx];
                const this_bot_name = bot[0];//c
                const w = bot[1];//w
                const l = bot[2];//l

                const out = this_bot_name + 
                    ': weight: ' + w +
                    ' level: ' + l;

                chatbots_str += out;
                chatbots_str += '\n';
            }

            self.write(chatbots_str);
        }catch(e){
            self.error(e);
        }
    }

    this.help_list = function(){
        self.write("List chatbot names");
    }

    this.do_l = this.do_list;
    this.help_l = this.help_list;

    this.do_select = function(line){
        try{
            const names = self.list_chatbot_names();
            
            for(let idx = 0; idx < names.length; idx++){
                const name = names[idx];
                if(line === name){
                    bot_name = line;
                    self.set_sid();
                    self.write("Select chatbot " + bot_name);
                    return;
                }
            }

            self.write("No such chatbot " + line);
        }catch(e){
            self.error(e);
            return;
        }
    }

    this.help_select = function(){
        self.write("Select chatbot");
    }

    this.do_conn = function(line){
        if(line){
            try{
                const url = line.split(':');
                chatbot_ip = url[0];
                chatbot_port = url[1];
                chatbot_url = 'http://' +
                    chatbot_ip + ':' +
                    chatbot_port + '/' +
                    VERSION;
            }catch(e){
                self.error("Wrong conn arguments\n");
                self.help_conn();
                return;
            }
        }
        self.write('Connecting.');
        self.set_sid();
    }

    this.help_conn = function(){
        const s = "\n"+
            "Connect to chatbot server\n"+
            "Syntax: conn [url:port]\n"+
            "For example, conn 127.0.0.1:8001\n";
        self.write(s);
    }

    this.do_ip = function(line){
        if(!line){
            self.write("ip is currently " + chatbot_ip);
            return;
        }

        chatbot_ip = line;
        chatbot_url = 'http://' + chatbot_ip + ':' + chatbot_port + '/' + VERSION;
        self.write("ip is now " + chatbot_ip);
        self.write("url is now " + chatbot_url);
    }

    this.help_ip = function(){
        const s = "\n"+
            "Set the IP address of chatbot server\n"+
            "Syntax: ip xxx.xxx.xxx.xxx\n"+
            "For example, ip 127.0.0.1\n";
        self.write(s);
    }

    this.do_port = function(line){
        if(!line){
            self.write("port is currently " + chatbot_port);
            return;
        }

        chatbot_port = line;
        chatbot_url = 'http://' + chatbot_ip + ':' + chatbot_port + '/' + VERSION;
        self.write("port is now " + chatbot_port);
        self.write("url is now " + chatbot_url);
    }

    this.help_port = function(){
        const s = "\n"+
            "Set the port of chatbot server\n"+
            "Syntax: port xxx\n"+
            "For example, port 8001\n";
        self.write(s);
    }

//    Not used, handled in interface.js
//    this.do_q = function(line){
//    }

    this.help_q = function(){
        self.write("Quits the chat\n");
    }

//    this._update = function(){
//        const params = {
//            'botname':bot_name,
//            'Auth':KEY
//        };
//        const url = chatbot_url + '/update';
//        const response = get(url,params).responseText;
//        const json = JSON.parse(response);
//
//        return json['ret'];
//    }
//
//    this.do_update = function(line){
//        try{
//            const params = {
//                'botname':bot_name,
//                'Auth':KEY
//            };
//
//            const url = chatbot_url + '/update';
//            const response = get(url, params).responseText;
//            const json = JSON.parse(response);
//            const ret = json['ret'];
//            const res = json['response'];
//
//            self.write(res);
//
//            if(ret)
//                self.write("Update successfully");
//            else
//                self.write("Update unsuccessfully");
//        }catch(e){
//            self.error(e);
//        }
//    }
//
//    this.help_update = function(){
//        self.write("Update current chatbot");
//    }
//
//    this.do_load_sheet_keys = function(line){
//        if(!line)
//            line = "";
//
//        try{
//            const params = {
//                'botname':bot_name,
//                'sheet_keys':line.trim(),
//                'Auth':KEY
//            };
//
//            const url = chatbot_url + '/set_keys';
//            const response = get(url,params).responseText;
//            const json = JSON.parse(response);
//            const ret = json['ret'];
//            const res = json['res'];
//
//            self.write(res);
//
//            if(ret)
//                write("Load sheet keys successfully");
//            else
//                write("Load sheet keys failed");
//        }catch(e){
//            self.error(e);
//        }
//    }
//
//    this.help_load_sheet_keys = function(){
//        self.write("Load sheet keys to the current chatbot");
//    }
//
//    this.do_commit = function(line){
//        if(!line)
//            line = "";
//
//        try{
//            const params = {
//                'botname':bot_name,
//                'Auth':key
//            };
//
//            const url = chatbot_url+'/commit';
//            const response = get(url,params).responseText;
//            const json = JSON.parse(response);
//            const ret = json['ret'];
//            const res = json['response'];
//
//            self.write(res);
//
//            if(ret)
//                self.write("Commit sheet successfully");
//            else
//                self.write("Commit sheet failed");
//        }catch(e){
//            self.error(e);
//        }
//    }
//
//    this.help_commit = function(){
//        self.write("Commit the current sheet to GitHub");
//    }

    this.do_lang = function(line){
        const new_lang = line.trim();
        if(new_lang === 'en' || new_lang === 'zh'){
            lang = new_lang;
            self.write("Set lang to " + lang);
        }else{
            self.write("Current lang " + lang + ". Set lang by \'lang [en|zh]\'");
        }
    }

    this.help_lang = function(){
        self.write("Set language. [en|zh]");
    }

    this.do_c = function(line){
        try{
            const params = {
                'session':session,
                'Auth':KEY
            };
            const url = chatbot_url + '/reset_session';
            const response = get(url,params).responseText;
            const json = JSON.parse(response);
            const ret = json['ret'];
            const res = json['response'];

            self.write(res);
        }catch(e){
            self.error(e);
        }
    }

    this.help_c = function(){
        self.write("Clean the memory of the dialog");
    }

    this.do_rw = function(line){
        try{
            const params = {
                'weights':line,
                'Auth':KEY,
                'lang':lang,
                'session':session
            };
            const url = chatbot_url + '/set_weights';
            const response = get(url,params).responseText;
            const json = JSON.parse(response);
            const ret = json['ret'];
            const res = json['response'];
            
            self.write(res);
        }catch(e){
            self.error(e);
        }
    }

    this.help_rw = function(){
        const s = "\n"+
            "Update the weights of the current chain.\n"+
            "Syntax: rw w1,w2,w3,...\n"+
            "For example, rw .2, .4, .5\n";
        self.write(s);
    }

    const input = document.createElement("INPUT");
    input.setAttribute("type", "file");

    let prompt_for_upload = function(callback){
        input.onchange = function(e){
            callback(input.files[0]);
        };
        input.click();
    }

    this.do_upload = function(){
        prompt_for_upload(function(file){
            try{
                const params = {
                    'user': user,
                    'Auth': KEY,
                    'lang': 'en'
                };

                const url = chatbot_url + '/upload_character';
                const response = post(url,params,file).responseText;
                const json = JSON.parse(response);
                const ret = json['ret']
                const res = json['response'];
                write(res);
            }catch(e){
                self.error(e);
            }
        });
    }

    this.help_upload = function(){
        const msg = "Upload character package.\n" +
            "Syntax: upload package\n";
        self.write(msg);
    }

    this.ping = function(){
        try{
            const url = chatbot_url + '/ping';
            const response = get(url).responseText;
            const json = JSON.parse(response);
            const res = json['response'];
            if(res === 'pong'){
                return true;
            }
        }catch(e){
            return false;
        }
    }

    this.do_ping = function(line){
        if(self.ping){
            self.write('pong');
        }else{
            self.write('');
        }
    }

    this.do_conn();

    this.get_PROMPT = function(){return PROMPT;}
    this.get_session = function(){return session;}
    this.get_lang = function(){return lang;}
    this.get_chatbot_port = function(){return chatbot_port;}
    this.get_chatbot_ip = function(){return chatbot_ip;}
    this.get_chatbot_url = function(){return chatbot_url;}
    this.get_bot_name = function(){return bot_name;}
}