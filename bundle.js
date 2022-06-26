const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')
const getModuleInfo = (file) => {
    // 传入的 file 标识一个路径
    // 最初的入口是 ./src/index.js
    const body = fs.readFileSync(file,'utf-8')
    const ast = parser.parse(body,{
        sourceType:'module' //表示我们要解析的是ES模块
    });
    
    // 每一个文件有一个自己的小 map , 从当前文件为起点, 相对地址来引用依赖
    const deps = {}

    // traverse(ast, Node.type)
    // 解析到对应类型的节点时调用该函数
    traverse(ast,{
        ImportDeclaration({node}){
            const dirname = path.dirname(file)
            const abspath = "./" + path.join(dirname,node.source.value)
            deps[node.source.value] = abspath
            // 从当前文件开始的相对路径 = 被依赖文件的绝对路径
        }
    })
    const {code} = babel.transformFromAst(ast,null,{
        presets:["@babel/preset-env"]
    })
    const moduleInfo = {file, deps, code}
    return moduleInfo
}
const parseModules = (file) =>{
    /**
     * 传入了一个 file(文件路径), getModuleInfo 会如何操作 ?
     * 根据当前路径去文件系统读取文件, 获得文件内容:源代码
     * 通过 <解析器> 获得源代码对应的 ast树
     * 得到 ast树 以后, 就可以获知当前文件引用了哪些其它文件
     */
    const entry = getModuleInfo(file)
    const temp = [entry]
    const depsGraph = {}
    const memo = {}
    for (let i = 0;i<temp.length;i++){
        const deps = temp[i].deps
        if (deps){
            for (const key in deps) {
                if (deps.hasOwnProperty(key) && !memo[key]) {
                    memo[key] = true
                    temp.push(getModuleInfo(deps[key]))
                }
            }
        }
    }

    temp.forEach(moduleInfo=>{
        depsGraph[moduleInfo.file] = {
            deps:moduleInfo.deps,
            code:moduleInfo.code
        }
    })
    return depsGraph
}
const bundle = (file) =>{
    const depsGraph = JSON.stringify(parseModules(file))
    return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
                // 以当前模块的文件路径为起点, 当前模块有一个自己的小型 map
                // 当前起点的相对路径 => 绝对路径
                // 然后根据绝对路径到总的 资源依赖图 寻找相关 module
            }
            var exports = {};
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code)
            return exports
        }
        require('${file}')
    })(${depsGraph})`

}
const content = bundle('./src/index.js')

// console.log(content);

//写入到我们的dist目录下
fs.mkdirSync('./dist');
fs.writeFileSync('./dist/bundle.js',content)
