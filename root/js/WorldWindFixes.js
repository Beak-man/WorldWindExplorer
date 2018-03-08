/* 
 * Copyright (c) 2016 Bruce Schubert.
 * The MIT License
 * http://www.opensource.org/licenses/mit-license
 */

/*global define, WorldWind*/


define(['worldwind'], function () {
    "use strict";

    var WorldWindFixes = function () {
    };

    /**
     * 
     */
    WorldWindFixes.applyLibraryFixes = function () {
        // Augment the 0.9.0 version WorldWind with bug fixes and customizations
        if (WorldWind.VERSION === "0.9.0") {

            /**
             * Adds the 'volatile' param to dc.gpuResourceCache.putResource
             * 
             */
            WorldWind.Text.prototype.makeOrderedRenderable = function (dc) {
                var w, h, s, offset;
                this.determineActiveAttributes(dc);
                if (!this.activeAttributes) {
                    return null;
                }
                //// Compute the text's screen point and distance to the eye point.
                if (!this.computeScreenPointAndEyeDistance(dc)) {
                    return null;
                }
                var labelFont = this.activeAttributes.font,
                        textureKey = this.text + labelFont.toString();
                this.activeTexture = dc.gpuResourceCache.resourceForKey(textureKey);
                if (!this.activeTexture) {
                    this.activeTexture = dc.textSupport.createTexture(dc, this.text, labelFont, true);
                    dc.gpuResourceCache.putResource(textureKey, this.activeTexture, this.activeTexture.size, true /*volatile*/);
                }
                w = this.activeTexture.imageWidth;
                h = this.activeTexture.imageHeight;
                s = this.activeAttributes.scale;
                offset = this.activeAttributes.offset.offsetForSize(w, h);
                this.imageTransform.setTranslation(
                        this.screenPoint[0] - offset[0] * s,
                        this.screenPoint[1] - offset[1] * s,
                        this.screenPoint[2]);
                this.imageTransform.setScale(w * s, h * s, 1);
                this.imageBounds = WorldWind.WWMath.boundingRectForUnitQuad(this.imageTransform);
                return this;
            };

            /**
             * Adds the optional 'isVolatile' param to putResource and passes the truthy variable to putEntry.
             * 
             */
            WorldWind.GpuResourceCache.prototype.putResource = function (key, resource, size, isVolatile) {
                if (!key) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "GpuResourceCache", "putResource", "missingKey."));
                }
                if (!resource) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "GpuResourceCache", "putResource", "missingResource."));
                }
                if (!size || size < 1) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "GpuResourceCache", "putResource",
                                    "The specified resource size is undefined or less than 1."));
                }
                var entry = {
                    resource: resource
                };
                this.entries.putEntry(key instanceof WorldWind.ImageSource ? key.key : key, entry, size, isVolatile);
            };


            /**
             * Adds the optional 'isVolatile' param to applies the truthy variable to the cacheEntry.
             * 
             */
            WorldWind.MemoryCache.prototype.putEntry = function (key, entry, size, isVolatile) {
                if (!key) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "MemoryCache", "putEntry", "missingKey."));
                }
                if (!entry) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "MemoryCache", "putEntry", "missingEntry."));
                }
                if (size < 1) {
                    throw new ArgumentError(
                            WorldWind.Logger.logMessage(WorldWind.Logger.LEVEL_SEVERE, "MemoryCache", "putEntry",
                                    "The specified entry size is less than 1."));
                }
                var existing = this.entries[key],
                        cacheEntry;
                if (existing) {
//                    console.log('putEntry > update: ' + key)
                    this.removeEntry(key);
                }

                if (this.usedCapacity + size > this._capacity) {
                    this.makeSpace(size);
                }
                this.usedCapacity += size;
                this.freeCapacity = this._capacity - this.usedCapacity;
                // BDS: added isVolatile property
                cacheEntry = {
                    key: key,
                    entry: entry,
                    size: size,
                    lastUsed: isVolatile ? Date.now() - 10e3 : Date.now(), // milliseconds
                    isVolatile: isVolatile ? true : false,
                    retrievedCount: 0
                };
                this.entries[key] = cacheEntry;
//                console.log('putEntry( ' + (this.usedCapacity / this._capacity * 100).toFixed(0) + '% )');
            };

            /**
             * 
             */
            WorldWind.MemoryCache.prototype.entryForKey = function (key) {
                if (!key)
                    return null;
                var cacheEntry = this.entries[key];
                if (!cacheEntry)
                    return null;
                cacheEntry.lastUsed = cacheEntry.isVolatile ? Date.now() - 10e3 : Date.now();   // milliseconds
                cacheEntry.retrievedCount++;
                return cacheEntry.entry;
            };

            /**
             * Dump the cache to the console
             * 
             */
            WorldWind.MemoryCache.prototype.makeSpace = function (spaceRequired) {
                var sortedEntries = [];
                // Sort the entries from least recently used to most recently used, then remove the least recently used entries
                // until the cache capacity reaches the low water and the cache has enough free capacity for the required
                // space.
                var sizeAtStart = this.usedCapacity;
                for (var key in this.entries) {
                    if (this.entries.hasOwnProperty(key)) {
                        sortedEntries.push(this.entries[key]);
                    }
                }
                sortedEntries.sort(function (a, b) {
                    return a.lastUsed - b.lastUsed;
                });
//                sortedEntries.sort(function (a, b) {
//                    if (a.isVolatile === b.isVolatile) {
//                        return a.lastUsed - b.lastUsed;
//                    }
//                    return a.isVolatile ? -1 : 1;
//                });
                // BDS: dump the sorted cache
                console.log("MemoryCache.makespace(" + spaceRequired + ") >>> [capacity: " + this._capacity + ", lowWater: " + this._lowWater + ")");
                console.log("MemoryCache before >>> [freeCapacity: " + this.freeCapacity + ", count: " + sortedEntries.length + ")");

//                for (var i = 0, len = sortedEntries.length; i < len; i++) {
//                    console.log(i + ': [' + sortedEntries[i].lastUsed + '] ' + sortedEntries[i].key);
//                }

                for (var i = 0, len = sortedEntries.length; i < len; i++) {
                    if (this.usedCapacity > this._lowWater || this.freeCapacity < spaceRequired) {
                        this.removeCacheEntry(sortedEntries[i]);
                    } else {
                        break;
                    }
                }
                console.log("MemoryCache after <<<< [freeCapacity: " + this.freeCapacity + ", count: " + (sortedEntries.length - i) + ")");

            };


            /**
             * Adds test for this.currentRetrievals.length > threshold
             * 
             */
            WorldWind.TiledImageLayer.prototype.retrieveTileImage = function (dc, tile, suppressRedraw) {
                if (this.currentRetrievals.indexOf(tile.imagePath) < 0) {
                    if (this.currentRetrievals.length > 16) {
//                        console.log("TiledImageLayer: >>> deferring " + tile.imagePath);
                        return;
                    }
//                    console.log("TiledImageLayer: <<<< retrieving " + tile.imagePath);

                    if (this.absentResourceList.isResourceAbsent(tile.imagePath)) {
                        return;
                    }

                    var url = this.resourceUrlForTile(tile, this.retrievalImageFormat),
                            image = new Image(),
                            imagePath = tile.imagePath,
                            cache = dc.gpuResourceCache,
                            canvas = dc.currentGlContext.canvas,
                            layer = this;
                    if (!url) {
                        this.currentTilesInvalid = true;
                        return;
                    }

                    image.onload = function () {
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_INFO, "Image retrieval succeeded: " + url);
                        var texture = layer.createTexture(dc, tile, image);
                        layer.removeFromCurrentRetrievals(imagePath);
                        if (texture) {
                            cache.putResource(imagePath, texture, texture.size);
                            layer.currentTilesInvalid = true;
                            layer.absentResourceList.unmarkResourceAbsent(imagePath);
                            if (!suppressRedraw) {
                                // Send an event to request a redraw.
                                var e = document.createEvent('Event');
                                e.initEvent(WorldWind.REDRAW_EVENT_TYPE, true, true);
                                canvas.dispatchEvent(e);
                            }
                        }
                    };
                    image.onerror = function () {
                        layer.removeFromCurrentRetrievals(imagePath);
                        layer.absentResourceList.markResourceAbsent(imagePath);
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING, "Image retrieval failed: " + url);
                    };
                    this.currentRetrievals.push(imagePath);
                    image.crossOrigin = this.crossOrigin;
                    //image.validate = "never";
                    image.src = url;
                }
            };

            /**
             * Adds test for this.currentRetrievals.length > threshold
             * 
             */
            WorldWind.WmtsLayer.prototype.retrieveTileImage = function (dc, tile) {
                if (this.currentRetrievals.indexOf(tile.imagePath) < 0) {
                    if (this.currentRetrievals.length > 16) {
//                        console.log("WmtsLayer: deferring " + tile.imagePath);
                        return;
                    }
//                    console.log("WmtsLayer: retrieving " + tile.imagePath);

                    if (this.absentResourceList.isResourceAbsent(tile.imagePath)) {
                        return;
                    }

                    var url = this.resourceUrlForTile(tile, this.imageFormat),
                            image = new Image(),
                            imagePath = tile.imagePath,
                            cache = dc.gpuResourceCache,
                            canvas = dc.currentGlContext.canvas,
                            layer = this;
                    if (!url) {
                        this.currentTilesInvalid = true;
                        return;
                    }

                    image.onload = function () {
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_INFO, "Image retrieval succeeded: " + url);
                        var texture = layer.createTexture(dc, tile, image);
                        layer.removeFromCurrentRetrievals(imagePath);
                        if (texture) {
                            cache.putResource(imagePath, texture, texture.size);
                            layer.currentTilesInvalid = true;
                            layer.absentResourceList.unmarkResourceAbsent(imagePath);
                            // Send an event to request a redraw.
                            var e = document.createEvent('Event');
                            e.initEvent(WorldWind.REDRAW_EVENT_TYPE, true, true);
                            canvas.dispatchEvent(e);
                        }
                    };
                    image.onerror = function () {
                        layer.removeFromCurrentRetrievals(imagePath);
                        layer.absentResourceList.markResourceAbsent(imagePath);
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING, "Image retrieval failed: " + url);
                    };
                    this.currentRetrievals.push(imagePath);
                    image.crossOrigin = 'anonymous';
                    image.src = url;
                }
            };

            /**
             * Use containsResource insteadof resourceForKey
             * 
             */
            WorldWind.SurfaceShapeTile.prototype.hasTexture = function (dc) {
                if (dc.pickingMode) {
                    return false;
                }
                if (!this.gpuCacheKey) {
                    this.gpuCacheKey = this.getCacheKey();
                }
                var gpuResourceCache = dc.gpuResourceCache;
                return gpuResourceCache.containsResource(this.gpuCacheKey);
            };

            /**
             * Uses isVolatile argument in putResource
             * 
             */
            WorldWind.SurfaceShapeTile.prototype.updateTexture = function (dc) {
                var gl = dc.currentGlContext,
                        canvas = WorldWind.SurfaceShapeTile.canvas,
                        ctx2D = WorldWind.SurfaceShapeTile.ctx2D;

                canvas.width = this.tileWidth;
                canvas.height = this.tileHeight;

                // Mapping from lat/lon to x/y:
                //  lon = minlon => x = 0
                //  lon = maxLon => x = 256
                //  lat = minLat => y = 256
                //  lat = maxLat => y = 0
                //  (assuming texture size is 256)
                // So:
                //  x = 256 / sector.dlon * (lon - minLon)
                //  y = -256 / sector.dlat * (lat - maxLat)
                var xScale = this.tileWidth / this.sector.deltaLongitude(),
                        yScale = -this.tileHeight / this.sector.deltaLatitude(),
                        xOffset = -this.sector.minLongitude * xScale,
                        yOffset = -this.sector.maxLatitude * yScale;

                // Reset the surface shape state keys
                this.asRenderedSurfaceShapeStateKeys = [];

                for (var idx = 0, len = this.surfaceShapes.length; idx < len; idx += 1) {
                    var shape = this.surfaceShapes[idx];
                    this.asRenderedSurfaceShapeStateKeys.push(this.surfaceShapeStateKeys[idx]);

                    shape.renderToTexture(dc, ctx2D, xScale, yScale, xOffset, yOffset);
                }

                this.gpuCacheKey = this.getCacheKey();

                var gpuResourceCache = dc.gpuResourceCache;
                var texture = new WorldWind.Texture(gl, canvas);
                gpuResourceCache.putResource(this.gpuCacheKey, texture, texture.size, true /*isVolatile*/);

                return texture;
            };

            /**
             * ElevationModel retrieveTileImage.
             *  Cache-Control
             */
            WorldWind.ElevationModel.prototype.retrieveTileImage = function (tile) {
                if (this.currentRetrievals.indexOf(tile.imagePath) < 0) {
                    var url = this.resourceUrlForTile(tile, this.retrievalImageFormat),
                            xhr = new XMLHttpRequest(),
                            elevationModel = this;

                    if (!url)
                        return;

                    xhr.open("GET", url, true);
                    xhr.setRequestHeader('Cache-Control', 'max-age=84000');
                    xhr.responseType = 'arraybuffer';
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {
                            elevationModel.removeFromCurrentRetrievals(tile.imagePath);

                            var contentType = xhr.getResponseHeader("content-type");

                            if (xhr.status === 200) {
                                if (contentType === elevationModel.retrievalImageFormat
                                        || contentType === "text/plain"
                                        || contentType === "application/octet-stream") {
                                    WorldWind.Logger.log(WorldWind.Logger.LEVEL_INFO, "Elevations retrieval succeeded: " + url);
                                    elevationModel.loadElevationImage(tile, xhr);
                                    elevationModel.absentResourceList.unmarkResourceAbsent(tile.imagePath);

                                    // Send an event to request a redraw.
                                    var e = document.createEvent('Event');
                                    e.initEvent(WorldWind.REDRAW_EVENT_TYPE, true, true);
                                    window.dispatchEvent(e);
                                } else if (contentType === "text/xml") {
                                    elevationModel.absentResourceList.markResourceAbsent(tile.imagePath);
                                    WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING,
                                            "Elevations retrieval failed (" + xhr.statusText + "): " + url + ".\n "
                                            + String.fromCharCode.apply(null, new Uint8Array(xhr.response)));
                                } else {
                                    elevationModel.absentResourceLWorldWind.ist.markResourceAbsent(tile.imagePath);
                                    WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING,
                                            "Elevations retrieval failed: " + url + ". " + "Unexpected content type "
                                            + contentType);
                                }
                            } else {
                                elevationModel.absentResourceList.markResourceAbsent(tile.imagePath);
                                WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING,
                                        "Elevations retrieval failed (" + xhr.statusText + "): " + url);
                            }
                        }
                    };

                    xhr.onerror = function () {
                        elevationModel.removeFromCurrentRetrievals(tile.imagePath);
                        elevationModel.absentResourceList.markResourceAbsent(tile.imagePath);
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING, "Elevations retrieval failed: " + url);
                    };

                    xhr.ontimeout = function () {
                        elevationModel.removeFromCurrentRetrievals(tile.imagePath);
                        elevationModel.absentResourceList.markResourceAbsent(tile.imagePath);
                        WorldWind.Logger.log(WorldWind.Logger.LEVEL_WARNING, "Elevations retrieval timed out: " + url);
                    };

                    xhr.send(null);

                    this.currentRetrievals.push(tile.imagePath);
                }
            };

        }

    };

    /**
     * 
     * @param {type} wwd
     * @returns {undefined}
     */
    WorldWindFixes.applyWorldWindowFixes = function (wwd) {
        // Increase size to prevent thrashing tile cache at oblique view from the surface
        wwd.drawContext.surfaceShapeTileBuilder.tileCache.capacity = 4.1e6;
        wwd.drawContext.surfaceShapeTileBuilder.tileCache.lowWater = 3.2e6;
    };

    return WorldWindFixes;
});