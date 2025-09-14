# Ancient Greek Geometry Logger
Logs info for constructions for https://sciencevsmagic.net/geo/ by Nico Disseldorp

See also: https://gist.github.com/mrflip/a973b1c60f4a38fc3277ddd57ce65b28 for solutions and my rambling

I'll publish solutions here too but I want to add details like the authors etc

I’m currently implementing a construction logger for the game, with AI assistance. Aims:

* Tracks source points of lines, arcs, and layers.

* Handles undo, reset, and load properly.

* Counts moves (extensions of existing lines don’t count).

* Logs new layers and tries to avoid duplicate entries.

* Aims to eventually support algebraic/symbolic logging (e.g., √3/2 instead of 0.866) to preserve exact constructibility.

* Plans to map log entries back to the game’s hash tokens (1A0, 0L3, etc.) so you know which command produced each coordinate.

It’s tricky—sometimes multiple or missing log entries appear for a single construction—but the logger doesn't edit geo.js and could potentially be made into a Chrome extension.

Extra feature: Lets you download all your unlocked progress from localStorage.

I should ask the creator, Nico Disseldorp, for guidance, permission, and suggestions...

Todo: Ah, I also need to add toggle for the logger like the sidebar...

## How to install for now:

Save page as (Ctrl-S or chrome 3 dot menu + Cast, save and share > save page as) https://sciencevsmagic.net/geo/ , as a complete webpage (not just html)

Add this to html
In sidebar between scrollbox and sidefooter:
```
<div id="localStorageDownload">
                                <p><a id="downloadLink">Download</a></p>
                        </div>
```

In body betwen sidebar and maincanvas:
```
<div id="coordbar">
                <div id="coordheader"><a>HISTORY</a></div>
                <div id="coordscroll"></div>
                <div id="coordnukerdiv"><a id="coordnuker">Clear log, shouldn't be neccessary</a></div>
        </div>
```
Between existing scripts, put it before init.js:
```
	<script src="./ANCIENT GREEK GEOMETRY_files/coord_logger.js"></script>
	<script src="./ANCIENT GREEK GEOMETRY_files/local_storage_download.js"></script>
  <script src="./ANCIENT GREEK GEOMETRY_files/init.js.download"></script>
```
Add this to CSS
```
#coordbar {
    user-select: text;
    z-index: 2;
    position: fixed;
    left: 0;
    bottom: 0;
    width: 250px;
    max-height: 400px;
    overflow: auto;
    background: rgba(240, 240, 240, 0.9);
    font-size: 12px;
    text-align: left;
    padding: 5px;
}

#coordheader {
    font-weight: bold;
    text-align: center;
    margin-bottom: 5px;
}

#coordscroll {
    overflow: auto;
    bottom: 0px;
}

.coord-entry {
  font-family: monospace;
  padding: 2px 4px;
  border-bottom: 1px solid #ddd;
}

#coordnukerdiv a {
        cursor: pointer;
    text-decoration: underline;
}

#localStorageDownload {
    border-left: 1px solid black;
    border-right: 1px solid black;
}

#localStorageDownload p {
    margin: 0px;
}

#localStorageDownload a {
        cursor: pointer;
    text-decoration: underline;
}
```

Optional, disable grab cursor: 
```
/* canvas.openhand I commented this out because Chrome with hardware acceleration makes grab cursor have no black outline i.e. invisible
{
cursor: grab;
cursor: -webkit-grab;
} */

/* canvas.closedhand
{
cursor: grabbing;
cursor: -webkit-grabbing;
} */

```
Add javascript files to the ANCIENT GREEK GEOMETRY_files folder (or wherever you point to script in html)
