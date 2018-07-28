const gulp = require("gulp");
const ts = require("gulp-typescript");
const tsProject = ts.createProject("tsconfig.json");

gulp.task("default", ["compile"], function () {
    return gulp.watch("./src/**/*.ts", ["compile"]);
});

gulp.task("compile", function () {
    return gulp.src("./src/**/*.ts")
        .pipe(tsProject())
        .js.pipe(gulp.dest("dist"));
});
