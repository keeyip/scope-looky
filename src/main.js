window.onpopstate = function(event) {
    if (event.state && event.state.command === 'renderInCodeViewer') {
        renderInCodeViewer(event.state.node, event.state.ast)
    }
}
var $codeViewer = $appWindowFullscreen
$('body').on('click', '.node-name', function(event) {
    var $el = $(event.currentTarget)
    var node = $el.data('node')
    var ast = $el.data('ast')
    window.history.pushState({
        command:'renderInCodeViewer',
        node:node,
        ast:ast
    })

    renderInCodeViewer(node,ast)
})

function renderInCodeViewer(node, ast) {
    $('body').off('.HideModal')
    var nodeWithComments = escodegen.attachComments($.extend(true, {}, node), ast.comments, ast.tokens)
    code = escodegen.generate(nodeWithComments, {
        comment: true,
        format: {
            indent: {
                style: '\t'
            },
            quotes: 'single'
        }
    })

    $codeViewer.remove()
    $appWindowContent.addClass('hidden')
    var $pre = $('<pre class="column width-70-percent">').text(code)
    var $outline = $('<div class="column width-30-percent">').append(renderOutline$(node, ast))
    $codeViewer
        .html($('<div class="row">')
            .append($pre)
            .append($outline))
    $appWindowBackdrop.appendTo('body')
    $codeViewer.appendTo('body')
    var hide = function() {
        $appWindowContent.removeClass('hidden')
        $('body').off('.HideModal');
        $appWindowBackdrop.remove()
        $codeViewer.remove()
    }
    $('body').one('click.HideModal', '#app-window-backdrop', hide)
    $('body').on('keyup.HideModal', function(event) {
        if (event.keyCode === 27) {
            hide()
        }
    })
}

function renderOutline$(currentNode, ast) {
    var $root = $('<ul class="scope-view scope-list">')
        .data('ast', ast)
    var $current = $root
    var scopes = []
    var scopeNames = []
    var scopesByDepth = {0:[]}
    var scopeDepth = 0, maxScopeDepth = scopeDepth
    var parentScope = null
    estraverse.traverse(currentNode, {
        enter: function(node) {
            if (isScopeNode(node)) {
                var scope = {
                    node:node,
                    depth:scopeDepth,
                    name: (node.id ? node.id.name : '') + '(' + _.map(node.params, function (param) { return param.name }).join(', ') + ')',
                    parent: parentScope,
                    children: [],
                }
                scope.relpath = parentScope ? parentScope.relpath + '/' + (scope.name || parentScope.children.length) : (scope.name || '')
                var size = node.body.body ? node.body.body.length : node.body.length
                var $li = $('<li class="scope">')
                    .append($('<span class="scope-name node-name">').text(scope.name || '-- no name --')
                        .data('ast', ast)
                        .data('scope', scope)
                        .data('node', node)
                        .attr('data-node-type', node.type)
                        .toggleClass('scope-no-name', !scope.name)
                        .append($('<span class="scope-size">').text(size)
                            .css({
                                width:size*2,
                                height:size*2,
                                'line-height':(size*2)+'px'
                            })
                        )
                    )
                    .append($('<span class="scope-relpath">').text(scope.relpath))
                    .append($('<ul class="variable-list">'))
                    .append($('<ul class="scope-list">'))
                $current.append($li)
                $current = $li.find('.scope-list')

                scopes.push(scope)
                if (parentScope) {
                    parentScope.children.push(scope)
                }
                parentScope = scope
                if (!_.isArray(scopesByDepth[scopeDepth])) {
                    scopesByDepth[scopeDepth] = []
                }
                scopesByDepth[scopeDepth].push(scope)
                if (node.id) {
                    scopeNames.push(node.id.name)
                }
                maxScopeDepth = Math.max(scopeDepth, maxScopeDepth)
                scopeDepth++
            }
        },
        leave: function(node) {
            if (isScopeNode(node)) {
                scopeDepth--
                if (parentScope) {
                    parentScope = parentScope.parent
                }
                $current = $current.parent().closest('.scope-list')
            } else if (node.type === 'VariableDeclarator') {
                var type = '?'
                var value = ''
                if (node.init) {
                    if (node.init.type === 'Literal') {
                        type = getType(node.init.value)
                        value =  node.init.raw
                    } else if (node.init.type === 'ArrayExpression') {
                        type = 'Array'
                        value = '[..]'
                    } else if (node.init.type === 'ObjectExpression') {
                        type = 'Dict'
                        value = ' = {..}'
                    }
                }
                $current.parent().find('> .variable-list')
                    .append($('<li class="variable">')
                        .append($('<span class="variable-name node-name">')
                            .data('ast', ast)
                            .data('node', node)
                            .toggleClass('variable-no-init', !node.init)
                            .text(node.id.name))
                        .append($('<span class="variable-value">')
                            .text(node.init ? ' = ' + value : '')
                        .append($('<span class="variable-type">')
                            .text(node.init ? ' : '+type : ''))))
            }
        }
    })

    console.warn($root)
    console.warn(ast)
    console.warn(scopes)
    console.warn(scopesByDepth)
    console.warn(scopeNames)
    console.warn('maxScopeDepth',maxScopeDepth)

    return $root
}
function renderCode$(code) {
    var ast = esprima.parse(code, {
        raw: true,
        tokens: true,
        range: true,
        comment: true
    });

    var $root = renderOutline$(ast, ast)
    return $root
}

function isScopeNode(node) {
    return /Program|CatchClause|FunctionDeclaration|FunctionExpression/.test(node.type)
}

function getType(value) {
    var TYPES = [
        'String',
        'Boolean',
        'Number',
        'Array',
        'RegExp',
        'Date',
        'Object',
        'Null',
        'Undefined'
    ]
    return _.find(TYPES, function(type) {
        return _['is'+type](value);
    })
}

function cmdOpenFile(file) {
    if (_.isString(file) && !_.isBlank(file)) {
        file = new File(file, null)
    }
    var filepath = (file && file.path || file.name) || ''
    if (!(file instanceof File) || !/\.js$/.test(filepath)) {
        $('#loadCode').val('')
        return;
    }
    //sample_require.toString().replace(/^function\s+\w+\s*\(\)\s*\{|}\s*$/g, '')
    var reader = new FileReader()
    reader.onload = function() {
        var code = reader.result
        $('#loadCodeUnderlay').text(filepath)
        try {
            $appWindowContent.find('#scope-view-wrapper')
                .html(renderCode$(code))
        } catch (err) {
            $('#loadCodeUnderlay').text('')
            $('#loadCode').val('')
        }
    }
    reader.readAsText(file)
}


$appWindowContent.append('<div id="scope-view-wrapper"></div>')
$appWindowContent.append('<div id="loadCodeUnderlay"></div>')
$appWindowContent.append('<input id="loadCode" type="file"/>')
$('#loadCode').on('change', function() {
    var file = this.files[0]
    if (file) {
        cmdOpenFile(file)
    }
})




$(function() {

    console.warn('SAMPLE')
    var code = function blah() {
        // Hello
        var x = 10; // Stuff
        for (var i = 0; i < 10; i++) {
            x = function () /* A */{
                if (i % 2 == 0 ) {
                    x = function() /* B */ {

                    }
                } else {
                    x = function() /* C */ {

                    }
                }
            }
        }
    }.toString()
    console.warn(code)
    var ast = esprima.parse(code, {
        raw: true,
        tokens: true,
        range: true,
        comment: true
    });
    var nodeWithComments = escodegen.attachComments(ast, ast.comments, ast.tokens)
    code = escodegen.generate(nodeWithComments, {
        comment: true,
        format: {
            indent: {
                style: '\t'
            },
            quotes: 'single'
        }
    })
    console.warn('EXAMPLE')
    var $root = $(),
        $current = $root
    var lines = code.split('\n')
    var clean = []
    var x = 0
    var currentNode

ast = esprima.parse(code, {
        raw: true,
        tokens: true,
        range: true,
        comment: true
    })


    estraverse.traverse(ast, {
        enter: function(node) {
            clean.push('<span class="align-top">'+code.substring(x, node.range[0])+'</span>')
             if (isScopeNode(node)) {
                 clean.push('<span class="pre-scope inline-block align-top">')
             }
            x = node.range[0]
        },
        leave: function(node) {
            console.warn('NODE',node)
            clean.push('<span class="align-top">'+code.substring(x, node.range[1])+'</span>')
             if (isScopeNode(node)) {
                 clean.push('</span>')
             }
            x = node.range[1]
            currentNode = node
        }
    })
    clean.push('<span class="align-top">'+code.substr(x)+'</span>')
    $appWindowContent.append('<pre>' + clean.join('') + '</pre>')
    console.warn('-----')
    console.warn(clean.join(''))
})
