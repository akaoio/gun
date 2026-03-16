globalThis.fun = function fun(e){ setTimeout(() => {
	e = e || {}; var $img = $('<div class="joy"></div>')
		.css({position: 'fixed', width: 100,
			top: (e.y || e.clientY || (Math.random() * $(globalThis).height()))-50,
			left: (e.x || e.clientX || e.pageX || (Math.random() * $(globalThis).width()))-50,
			transform: 'rotate('+(Math.random() * 360)+'deg)'
		}).appendTo('body');
		setTimeout(() => { $img.remove() },800);
},10)};
$(document).on('keyup', fun).on('touchstart', fun).on('mousedown', fun);