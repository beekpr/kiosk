chrome.app.runtime.onLaunched.addListener(init);
chrome.app.runtime.onRestarted.addListener(init);

var directoryServer, adminServer;

function init() {

  var win, basePath, socketInfo, data;
  var filesMap = {};

  chrome.storage.local.get(null,function(data){
    if(('url' in data)){
      //setup has been completed

      // Sleepmode may not have been selected by user in setup because it
      // is a new config param, so assume the previous hard-coded value as
      // default.
      if (!data.sleepmode) {
        chrome.storage.local.set({'sleepmode': 'display'});
        data.sleepmode = 'display';
      }
      if (data.sleepmode == 'none') {
        chrome.power.releaseKeepAwake();
      } else {
        chrome.power.requestKeepAwake(data.sleepmode);
      }

      if(data.servelocaldirectory && data.servelocalhost && data.servelocalport){
        //serve files from local directory
        chrome.fileSystem.restoreEntry(data.servelocaldirectory,function(entry){
          var host = data.servelocalhost;
          var port = data.servelocalport;
          startWebserverDirectoryEntry(host,port,entry)
        });
      }
      if(data.host && data.port){
        //make setup page available remotely via HTTP
        startWebserver(data.host,data.port,'www',data);
      }
      openWindow("windows/browser.html", true);
    }else{
      //need to run setup
      openWindow("windows/setup.html");
    }
  });

  chrome.runtime.onMessage.addListener(function(request,sender,sendResponse){
    if(request == "demo")
     openWindow("windows/demo.html");
    else if(request == "reload"){
      chrome.runtime.getPlatformInfo(function(p){
        if(p.os == "cros"){
          //we're on ChromeOS, so `reload()` will always work
          chrome.runtime.reload();
        }else{
          //we're OSX/Win/*nix so `reload()` may not work if Chrome is not
          // running the background. Simply close all windows and reset.
          if(directoryServer) directoryServer.stop();
          if(adminServer) adminServer.stop();
          var w = chrome.app.window.getAll();
          for(var i = 0; i < w.length; i++){
            w[i].close();
          }
          init();
        }
      });
    }
  });

  function openWindow(path, onAll){
    if(win && win.length > 0) {
      for (wi of win) {
        wi.close();
      }
    }
    chrome.system.display.getInfo(function(displayInfos){
      win = [];
      for (var i = 0; i < displayInfos.length; i++) {
        display = displayInfos[i];
        chrome.app.window.create(path, {
          'frame': 'none',
          'id': 'browser-' + i,
          'state': 'fullscreen',
          'outerBounds': {
            'left': display.workArea.left,
            'top': display.workArea.top,
            'width':display.workArea.width,
            'height':display.workArea.height
          }
        }, function(w){
            win.push(w);
            if (w && w.contentWindow) {
              w.contentWindow.urlNumber = parseInt(w.id.split("-")[1]);
            }
            w.fullscreen();
            setTimeout(function(){
              w.fullscreen();
            }, 1000);
        });
        if (!onAll) {
          break;
        }
      }
    });
  }

  function startWebserverDirectoryEntry(host,port,entry) {
    directoryServer = new WSC.WebApplication({host:host,
                                              port:port,
                                              renderIndex:true,
                                              entry:entry
                                             })
    directoryServer.start()
  }

  //directory must be a subdirectory of the package
  function startWebserver(host,port,directory,settings){
    chrome.runtime.getPackageDirectoryEntry(function(packageDirectory){
      packageDirectory.getDirectory(directory,{create: false},function(webroot){
        var fs = new WSC.FileSystem(webroot)
        var handlers = [['/data.*', AdminDataHandler],
                        ['.*', WSC.DirectoryEntryHandler.bind(null, fs)]]
        adminServer = new WSC.WebApplication({host:host,
                                              port:port,
                                              handlers:handlers,
                                              renderIndex:true,
                                              auth:{ username: settings.username,
                                                     password: settings.password }
                                             })
        adminServer.start()
      });
    });
  }
}
