/* Copyright (C) Eelco Vriezekolk, Universiteit Twente, Agentschap Telecom.
 * See LICENSE.md
 */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Service: object representing one service.
 *
 * Class variables (those prefixed with underscore should not be accessed from outside)
 *	cid: integer ID of the currently active service
 *	_all[]: array of all services, indexed on service ID
 *	get(i): returns the object with id 'i'.
 *	titleisused(p,str,e): checks whether there is a service in project p, other than
 *		service e, having title str.
 * Instance properties:
 *	id: (integer) unique ID of the service
 *	project: (object) project to which this service belongs
 *	title: (string) short name of the service (max 50 chars).
 *	_painted: boolean, indicates whether all Nodes have been painted already;
 *		necessary to avoid painting them twice.
 *	_loaded: boolean, indicates whether all DOM elements have been created;
 *		necessary to avoid painting on non-existing DIVs.
 *	_jsPlumb: instance of jsPlumb for this service and workspace.
 * Methods:
 *	destroy(): destructor for this object.
 *	settitle(t): change the title to 't' (50 chars max). The actual title may receive
 *		a numerical suffix to make it unique. This.project must be set first!
 *	autosettitle: choose a unique standard name. The project must be set first!
 *		Either settitle() or autosettitle() must be called.
 *	setproject(p): change the project to which this service belongs to the one with id p.
 *	unload(): remove all DOM elements for this service, except nodes.
 *  removetab(prefix): remove DOM elements for diagrams or single failures
 *	load(): create and set all DOM elements for this service, except nodes.
 *  addtabdiagrams(): create and set DOM elements for this service's diagram
 *  addtabsinglefs(): create and set DOM elements for this service's single failures
 *	unpaintall(): remove all Nodes for this service.
 *	paintall(): create and set all Nodes for this service.
 *	_stringify: create a JSON text string representing this object's data.
 *	exportstring: return a line of text for insertion when saving this file.
 *	store(): store the object into localStorage.
 */
var Service = function(id) {
	if (id!=null && Service._all[id]!=null)
		bugreport("Service with id "+id+" already exists","Service.constructor");
	this.id = (id==null ? nextUnusedIndex(Service._all) : id);
	this.project = Project.cid;
	this.title = "";
	this._painted=false;
	this._loaded=false;
	this._jsPlumb = jsPlumb.getInstance({
		PaintStyle: {
			strokeWidth: 3,
			stroke: '#666'
		},
		EndpointStyle: {
			strokeWidth: 10,
			fill: '#aaa'
		},
		EndpointHoverStyle: {
			fill: '#666',
			stroke: '#000'
		},
		DragOptions: { cursor: 'move' },
		Endpoint: [ 'Dot', { radius: 6 } ]
	});
	
	this.store();
	Service._all[this.id]=this;
};
Service.get = function(id) { return Service._all[id]; };
Service.cid = 0;
Service._all = [];
Service.titleisused = function(projectid,str,except) {
	var found=false;
	for (var i=0; !found && i<Service._all.length; i++) {
		if (i==except) continue;
		if (Service._all[i]!=null && Service._all[i].project==projectid)
			found=(Service._all[i].title==str);
	}
	return found;
};

Service.prototype = {
	destroy: function() {
		if (Project.cid==this.project)
			this.unload();
		var it = new NodeIterator({service: this.id});
		for (it.first(); it.notlast(); it.next())
			it.getnode().destroy(false);		
		localStorage.removeItem(LS+'S:'+this.id);
		Service._all[this.id]=null;
	},
	
	settitle: function(newtitle) {
		newtitle = trimwhitespace(String(newtitle)).substr(0,50);
		if (newtitle=='') return;
		var targettitle = newtitle;
		if (Service.titleisused(this.project,targettitle,this.id)) {
			var n=0;
			do 
				targettitle = newtitle + " (" + (++n) + ")";
			while (Service.titleisused(this.project,targettitle,this.id));
		}
		this.title = targettitle;
		$('.servicename'+this.id).html(H(this.title));
		$('.tabtitle'+this.id).attr('title',H(this.title));
		$('#diagramstabtitle'+this.id).text(this.title);
		$('#singlefstabtitle'+this.id).text(this.title);
		this.store();
	},

	autosettitle: function() {
		this.settitle(_("New service"));
	},

	setproject: function(p) {
		this.project = p;
		this.store();
	},

	unload: function() {
		this.unpaintall();
		this.removetab('diagrams');
		this.removetab('singlefs');
		this._loaded=false;
	},

	removetab: function(tabprefix) {
		// Remove the tab contents
		$('#'+tabprefix+this.id).remove();
		// Remove the bottom tab (the one that controls div#tabprefix+sid)
		$('#'+tabprefix+'_body').find('li[aria-controls='+tabprefix+this.id+']').remove();
		$('#'+tabprefix+'_body').tabs('refresh');
		if (tabprefix=='diagrams')
			$('#scroller_overview'+this.id).remove();
	},

	load: function() {
		this._jsPlumb.bind('beforeDrop', dropfunction );
		this.addtabdiagrams();
		this.addtabsinglefs();
		$('#bottomtabsdia').sortable({
			stop: function(evt,ui) {
				var p = Project.get(Project.cid);
				// Set the new order of services
				var arr = $('#bottomtabsdia').sortable('toArray');
				arr.forEach(function(v,i,a) {a[i] = nid2id(v);});
				p.services = arr;
				// Remove all service tabs on Single Failures, and re-create.
				$('#bottomtabssf').empty();
				arr.forEach(function(v,i,a) {
					var s = Service.get(v);
					s._addtabsinglefs_tabonly();
				});
				p.store();
				$('#diagrams_body').tabs('refresh');
				$('#singlefs_body').tabs('refresh');
				transactionCompleted("reordering services");
			}
		});
		$('#bottomtabssf').sortable({
			stop: function(evt,ui) {
				var p = Project.get(Project.cid);
				// Set the new order of services
				var arr = $('#bottomtabssf').sortable('toArray');
				arr.forEach(function(v,i,a) {a[i] = nid2id(v);});
				p.services = arr;
				// Remove all service tabs on Diagrams, and re-create.
				$('#bottomtabsdia').empty();
				arr.forEach(function(v,i,a) {
					var s = Service.get(v);
					s._addtabdiagrams_tabonly();
				});
				p.store();
				$('#diagrams_body').tabs('refresh');
				$('#singlefs_body').tabs('refresh');
				transactionCompleted("reordering services");
			}
		});
		SizeDOMElements();
		this._loaded=true;
	},
	
	_addtabdiagrams_tabonly: function() {
		/* Create a new tab */
		var snippet = '<li id="diaservicetab_I_">\
			<a href="#_PF__I_">\
			  <span id="_PF_tabtitle_I_" title="_T_" class="tabtitle tabtitle_I_">_T_</span>\
			</a>\
				<span id="_PF_tabclose_I_" class="ui-icon ui-icon-close tabcloseicon" role="presentation">Remove Tab</span>\
			</li>\
			';
		snippet = snippet.replace(/_T_/g, H(this.title));
		snippet = snippet.replace(/_I_/g, this.id);
		snippet = snippet.replace(/_PF_/g, 'diagrams');
		$(snippet).appendTo( '#diagrams_body .ui-tabs-nav' );
		
		/* We have bottom tabs, so have to correct the tab corners */
		$('a[href^="#diagrams'+this.id+'"]').on('dblclick',  diagramTabEditStart );
		$('a[href^="#diagrams'+this.id+'"]').on('click',  function(evt,ui) {
			var s = Service.get(nid2id(this.hash));
			Preferences.setservice(s.title);
		} );
	},
	
	addtabdiagrams: function() {
		var serviceid = this.id; // For use in event handler functions
		this._addtabdiagrams_tabonly();
		
		/* Add content to the new tab */
		var snippet = '\n\
			<div id="diagrams_I_" class="ui-tabs-panel ui-widget-content ui-corner-tl workspace"></div>\n\
			<div id="scroller_overview_I_" class="scroller_overview">\n\
				<div id="scroller_region_I_" class="scroller_region"></div>\n\
			</div>\n\
		';
		snippet = snippet.replace(/_I_/g, this.id);
		$('#diagrams_body').append(snippet);
#ifdef STANDALONE
		$('#scroller_overview'+this.id).css('top','20px');
#endif
		snippet = '\n\
			<h1 class="printonly underlay servicename_I_">_SN_</h1>\n\
			<h2 class="printonly underlay projectname">_LP_: _PN_</h2>\n\
			<div id="diagrams_workspace_I_" class="fancyworkspace"></div>\n\
		';
		snippet = snippet.replace(/_LP_/g, _("Project"));
		snippet = snippet.replace(/_I_/g, this.id);
		snippet = snippet.replace(/_SN_/g, H(this.title));
		snippet = snippet.replace(/_PN_/g, H(Project.get(this.project).title));
		snippet = snippet.replace(/_PJ_/g, this.project);
		$('#diagrams'+this.id).append(snippet);
		$('#diagrams_body').tabs('refresh');
		$('#diagrams_body ul li').removeClass('ui-corner-top');

		// Update the scroll_region when the workspace is scrolled.
		$('#diagrams'+this.id).on('scroll', function(event){
			if (ScrollerDragging) return;
			var wst = $('#diagrams'+serviceid).scrollTop();
			var wsl = $('#diagrams'+serviceid).scrollLeft();
			var fh = $('.fancyworkspace').height();
			var fw = $('.fancyworkspace').width();
			var oh = $('#scroller_overview'+serviceid).height();
			var ow = $('#scroller_overview'+serviceid).width();
			$('#scroller_region'+serviceid).css('top',(wst*oh)/fh+'px').css('left',(wsl*ow)/fw+'px');
		});

		$('#scroller_overview'+this.id).draggable({
			stop: function(event,ui){
				var l = $('#scroller_overview'+serviceid).position().left;
				var w = $('#diagrams'+serviceid).width();
				$('#scroller_overview'+serviceid).css('right', (w-l) + 'px').css('left','');
			},
			containment: 'parent',
			cursor: 'move'
		});
		$('#diagrams_workspace'+this.id).on('mousedown', function(evt) {
			if (evt.button!=0) return; // only do left mousebutton
			if (evt.eventPhase==Event.BUBBLING_PHASE) return; // Only direct events
			RectDragOrigin = {left: evt.pageX, top: evt.pageY};
			$('#selectrect').show().offset({left: evt.pageX, top: evt.pageY}).width(0).height(0);
			$('#diagrams_workspace'+serviceid).on('mousemove', function(evt) {
				if (evt.button!=0 || evt.shiftKey || evt.ctrlKey || evt.altKey || evt.metaKey) 
					return; // only do plain left mousebutton drags
				// If any text was selected (accidentally, most likely), then deselect it.
				window.getSelection().removeAllRanges();
				var w = evt.pageX-RectDragOrigin.left;
				var h = evt.pageY-RectDragOrigin.top;
				if (w<0 || h<0) {
					var o = $('#selectrect').offset();
					if (w<0) {
						o.left = RectDragOrigin.left + w;
						w = -w;
					}
					if (h<0) {
						o.top = RectDragOrigin.top + h;
						h = -h;
					}
					$('#selectrect').offset({left: o.left, top: o.top}).width(w).height(h);
				} else {
					$('#selectrect').width(w).height(h);
				}
			});
			removetransientwindows();
		});
		$('#diagrams_workspace'+this.id).on('mouseup',  function(evt) {
			if (evt.button!=0) 
				return; // only do plain left mousebutton drags
			if (evt.target.id=="") return; // Only direct events, or drag-stops
			// Direct click on the workspace, steal the focus from wherever it was.
			$( document.activeElement ).trigger('blur');
			if (Node.nodesinselection().length==0)
				$('#selectrect').hide();
			// If any text was selected (accidentally, most likely), then deselect it.
			window.getSelection().removeAllRanges();
			//console.debug("Stole the focus");
			$('#diagrams_workspace'+serviceid).off('mousemove');
		});

		$('#scroller_region'+this.id).draggable({
			cursor: 'move',
			containment: 'parent',
			drag: function(event, ui) {
				var rO = $('#scroller_region'+serviceid).position();
				var fh = $('.fancyworkspace').height();
				var fw = $('.fancyworkspace').width();
				var oh = $('#scroller_overview'+serviceid).height();
				var ow = $('#scroller_overview'+serviceid).width();
				/* 
				 */
				var dtop = (rO.top * fh)/oh;
				var dleft = (rO.left * fw)/ow;
				if (dtop<0) dtop=0;
				if (dleft<0) dleft=0;
				$('#diagrams'+serviceid).scrollTop(dtop);
				$('#diagrams'+serviceid).scrollLeft(dleft);
			},
			start: function() {
				ScrollerDragging = true;
			},
			stop: function() {
				ScrollerDragging = false;
			}
		});

		$('.workspace').droppable({
			accept: '.templatebg,.templatebgNOT',
			drop: workspacedrophandler
		});
	},

	_addtabsinglefs_tabonly: function() {
		/* Create a new tab */
		var snippet = '<li id="sfservicetab_I_">\
			<a href="#_PF__I_">\
			  <span id="_PF_tabtitle_I_" title="_T_" class="tabtitle tabtitle_I_">_T_</span>\
			</a>\
				<span id="_PF_tabclose_I_" class="ui-icon ui-icon-close tabcloseicon" role="presentation">Remove Tab</span>\
			</li>\
			';
		snippet = snippet.replace(/_T_/g, H(this.title));
		snippet = snippet.replace(/_I_/g, this.id);
		snippet = snippet.replace(/_PF_/g, 'singlefs');
		$(snippet).appendTo( '#singlefs_body .ui-tabs-nav' );
		
		/* We have bottom tabs, so have to correct the tab corners */
		$('a[href^="#singlefs'+this.id+'"]').on('dblclick',  diagramTabEditStart );
		$('a[href^="#singlefs'+this.id+'"]').on('click',  function(evt,ui) {
			var s = Service.get(nid2id(this.hash));
			Preferences.setservice(s.title);
		} );
	},
	
	addtabsinglefs: function() {
		this._addtabsinglefs_tabonly();

		/* Add content to the new tab */
		var snippet = '\n\
			<div id="singlefs_I_" class="ui-tabs-panel ui-widget-content ui-corner-tl workspace"></div>\n\
		';
		snippet = snippet.replace(/_I_/g, this.id);
		$('#singlefs_body').append(snippet);
		snippet = '\n\
			<h1 class="printonly underlay servicename_I_">_LSF_: _SN_</h1>\n\
			<h2 class="printonly underlay projectname">_LP_: _PN_</h2>\n\
			<div id="singlefs_workspace_I_" class="workspace plainworkspace"></div>\n\
		';
		snippet = snippet.replace(/_LP_/g, _("Project"));
		snippet = snippet.replace(/_LSF_/g, _("Single failures"));
		snippet = snippet.replace(/_I_/g, this.id);
		snippet = snippet.replace(/_SN_/g, H(this.title));
		snippet = snippet.replace(/_PN_/g, H(Project.get(this.project).title));
		snippet = snippet.replace(/_PJ_/g, this.project);
		$('#singlefs'+this.id).append(snippet);
		$('#singlefs_body').tabs('refresh');
		$('#singlefs_body ul li').removeClass('ui-corner-top');
	},

	unpaintall: function() {
		$('#scroller_overview'+this.id).hide();
		if (!this._painted) return;
		if (this.id==Service.cid)
			$('#nodereport').hide();
		// Be sure to only remove nodes from this service.
		var it = new NodeIterator({service: this.id});
		for (it.first(); it.notlast(); it.next())
			it.getnode().unpaint();
		this._jsPlumb.reset();
		this._painted=false;
	},
	
	paintall: function() {
		if (!this._loaded) return;
		// For some reason, the mouseup event on #selectrect is only fired consistently when
		// the #selectrect div is inside the workspace. If the div is inside diagrams_body or
		// inside the main <body>, the mouseup is almost always 'lost'. We therefore have to
		// delete #selectrect, resurrect it, and re-bind the menu event handler.
		$('.scroller_overview').hide();
		$('#scroller_overview'+this.id).show();
		$('#selectrect').remove();
		$('#diagrams_workspace'+this.id).append('<div id="selectrect"></div>');
		$('#selectrect').bind('contextmenu', function(e) {
			e.preventDefault();
			$('#selectmenu').css('left', e.pageX+4).css('top', e.pageY+4);
			$('.popupsubmenu').hide();
			$('#selectmenu').css('display', 'block');
			return false;
		});
		var origpos;
		$('#selectrect').draggable({
			start: function(event,ui) {
				origpos = ui.position;
				NodesBeingDragged = Node.nodesinselection();
			},
			drag: function(event,ui) {
				// Drag all nodes in the selection
				var dx = (ui.position.left-origpos.left);
				var dy = (ui.position.top-origpos.top);
				origpos = ui.position;
				for (var i=0; i<NodesBeingDragged.length; i++) {
					var n = Node.get(NodesBeingDragged[i]);
					n.setposition(n.position.x+dx,n.position.y+dy,false);
				}
			},
			stop: function(event,ui) {
				for (var i=0; i<NodesBeingDragged.length; i++) {
					var n = Node.get(NodesBeingDragged[i]);
					n.setposition(n.position.x,n.position.y);
				}
				transactionCompleted("Node move selection");
			},
			cursor: 'move'
		});
		
		if (this._painted) return;

		this._jsPlumb.setContainer('diagrams_workspace'+this.id);
		// Delay all jsPlumb paint operations
		this._jsPlumb.setSuspendDrawing(true);
		/* First paint all the nodes, before drawing the connectors */
		var it = new NodeIterator({service: this.id});
		for (it.first(); it.notlast(); it.next())
			it.getnode().paint(false);
		
		/* All nodes exist, now draw connectors. When node X is connected to
		 * node Y, then also node Y is connected to node X. However, we must
		 * only draw their connector once. We therefore only draw a connector
		 * when X.id < Y.id
		 */
		for (it.first(); it.notlast(); it.next()) {
			var rn = it.getnode();
			for (var j=0; j<rn.connect.length; j++) {
				var dst = Node.get(rn.connect[j]);
				if (DEBUG && dst.service!=this.id) 
					bugreport('inconsistency in connections between nodes','Service.paintall');
				if (rn.id<dst.id)
					rn.attach_center(dst);
			}
		}
		for (it.first(); it.notlast(); it.next()) {
			rn = it.getnode();
			rn.setmarker();
		}
		RefreshNodeReportDialog();
		this._jsPlumb.setSuspendDrawing(false, true);
		Service.cid = this.id;
		this._painted=true;
	},

	_stringify: function() {
		var data = {};
		data.l=this.title;
		data.p=this.project;
		return JSON.stringify(data);
	},

	exportstring: function() {
		var key = LS+'S:'+this.id;
		return key + '\t' + this._stringify() + '\n';
	},

	store: function() {
		var key = LS+'S:'+this.id;
		localStorage[key] = this._stringify();
	}
};


/* This function is called before a connection is made when dragging
 * from the dragpoint of a node onto another node.
 */
function dropfunction(data) {
	var src = Node.get(nid2id(data.sourceId));
	var dst = Node.get(nid2id(data.targetId));

	if (!src || !dst) {
        bugreport("Incorrect nodes","dropfunction");
        return;
	}

    if (data.scope=='center') {
        bugreport("Connection in default scope","dropfunction");
        return;
    }
    src.try_attach_center(dst);
	Service.get(src.service)._jsPlumb.deleteEndpoint(data.dropEndpoint);
}

var RectDragOrigin = {left:0, top:0};
var ScrollerDragging = false;
var NodesBeingDragged = [];


function diagramTabEditStart(event) {
	var s = Service.get(nid2id(this.hash));
	var dialog = $('<div></div>');
	var snippet ='\
		<form id="form_servicerename">\
		<input id="field_servicerename" class="field_rename" name="fld" type="text" value="_SN_">\
		</form>\
	';
	snippet = snippet.replace(/_SN_/g, H(s.title));
	dialog.append(snippet);
	var dbuttons = [];
	dbuttons.push({
		text: _("Cancel"),
		click: function() {
				$(this).dialog('close');
			}
	});
	dbuttons.push({
		text: _("Change name"),
		click: function() {
				var name = $('#field_servicerename');
				s.settitle(name.val());
				$(this).dialog('close');
				transactionCompleted("Service rename");
			}
	});
	dialog.dialog({
		title: _("Rename service '%%'", s.title),
		modal: true,
		position: {my: 'center', at: 'center'},
		width: 350,
		height: 130,
		buttons: dbuttons,
		open: function() {
			$('#field_servicerename').focus().select();
			$('#form_servicerename').submit(function() {
				var name = $('#field_servicerename');
				s.settitle(name.val());
				dialog.dialog('close');
				transactionCompleted("Service rename");
			});
		},
		close: function(event, ui) {
			dialog.remove();
		}
	});
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * ServiceIterator: iterate over all services of a project
 *
 * usage:
 * 		var it = new ServiceIterator(projectID);
 * 		for (it.first(); it.notlast(); it.next()) {
 *			var s = it.getservice();
 *	 		:
 *		}
 */
var ServiceIterator = function(pid) {
	this.pid = pid;
	this.index = 0;
	this.item = [];
	for (var i=0; i<Service._all.length; i++) {
		if (Service._all[i]==null) continue;
		var s =  Service._all[i];
		if (s.project == pid)
			this.item.push(i);
	}
};
ServiceIterator.prototype = {
	first: function() {this.index=0;},
	next: function() {this.index++;},
	notlast: function() {return (this.index < this.item.length);},
	getservice: function() {return Service.get( this.item[this.index] );},
	getserviceid: function() {return this.item[this.index];},
	sortByName: function() {
		this.item.sort( function(a,b) {
			var na = Service.get(a);
			var nb = Service.get(b);
			return na.title.toLocaleLowerCase().localeCompare(nb.title.toLocaleLowerCase());
		});
	}
};

