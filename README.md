# Ancient Greek Geometry Logger

Symbolic logging not functional, current main issue is [#25](https://github.com/Eddy119/Ancient-Greek-Geometry-Logger/issues/25): For certain calculations involving quadratic surds (e.g. pentagon vertices with √5), the in-app symbolic simplifier (Algebrite) can produce very large expanded expressions such as $\frac{7985/4 + (3571/4)\sqrt{5}}{(2+\sqrt{5})^6}$ instead of the compact $\frac{5-\sqrt{5}}{4}$. This is algebraically correct but causes downstream string bloat, freezing the logger. See [issue #25](https://github.com/Eddy119/Ancient-Greek-Geometry-Logger/issues/25) for details, and suggested fixes by ChatGPT.

[Issue #18](https://github.com/Eddy119/Ancient-Greek-Geometry-Logger/issues/18): you need to click on your unlocked shapes twice on the bottom right sidebar for log to load

Logs info for constructions for https://sciencevsmagic.net/geo/ by Nico Disseldorp

See also: https://gist.github.com/mrflip/a973b1c60f4a38fc3277ddd57ce65b28 for solutions and my rambling

I'll publish solutions here too but I want to add details like the authors etc

If you just want to print numerical coords and lengths calculated by the game there's a [release](https://github.com/Eddy119/Ancient-Greek-Geometry-Logger/releases/tag/v1_Coordinates_only), I'm working on symbolic coords and lengths.

I’m currently implementing a construction logger for the game, with AI assistance. Aims:

* Tracks source points of lines, arcs, and layers. Done with `changes.record()`.

* Handles undo, reset, and load properly. Using `changes.undo()` and `!lastpoint`, This is hard, WIP.

* Counts moves (extensions of existing lines don’t count). Done with `modules.test.score()`.

* Logs new layers and tries to avoid duplicate entries. Think this is done.

* Aims to eventually support algebraic/symbolic logging (e.g., √3/2 instead of 0.866) to preserve exact constructibility. Gonna use [nerdamer-prime](https://github.com/together-science/nerdamer-prime).

* Plans to map log entries back to the game’s hash tokens (1A0, 0L3, etc.) so you know which command produced each coordinate. Done with reading `changes`.

It’s tricky—sometimes multiple or missing log entries appear for a single construction—but the logger doesn't edit geo.js and could potentially be made into a Chrome extension.

Extra feature: Lets you download all your unlocked progress from localStorage.

I'm trying to ask the creator, Nico Disseldorp, for guidance, permission, and suggestions...

Todo: Ah, I also need to add toggle for the logger like the sidebar... Update: done. Click HISTORY (coordheader) to toggle collapse.

## About License

I know AGPL is overkill, this code is probably too short for any worthy copyright, and idk how it works legally, and you don't need to worry about legal either, but it'd be nice if:
* you credited me, 
* link the URL to this GitHub repo, 
* and share your source code of your contributions/modifications (in fact pls help me improve this).

You probably don't need to include the full license (since it can be found here through the URL). Again, this is just a logger for someone else's work. A lot of the effort was figuring out how their game worked.

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
	<!-- Algebrite script -->
    <script src="https://cdn.jsdelivr.net/npm/algebrite@1.4.0/dist/algebrite.bundle-for-browser.min.js"></script>
    <!-- my scripts -->
	<script src="./ANCIENT GREEK GEOMETRY_files/coord_logger.js"></script>
	<script src="./ANCIENT GREEK GEOMETRY_files/local_storage_download.js"></script>
	<script src="./ANCIENT GREEK GEOMETRY_files/coordbartoggle.js"></script>
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
	display: flex;
	flex-direction: column-reverse;
}

#coordheader {
    font-weight: bold;
    text-align: center;
    margin-bottom: 5px;
    cursor: pointer; 
}

#coordscroll {
    overflow: visible;
    overflow-wrap: anywhere;
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
