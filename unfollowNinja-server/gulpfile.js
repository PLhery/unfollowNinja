const gulp = require("gulp");
const ts = require("gulp-typescript");
const tsProject = ts.createProject("tsconfig.json");

gulp.task("compile", function () {
    return gulp.src("./src/**/*.ts")
        .pipe(tsProject())
        .on('error', () => {})
        .js.pipe(gulp.dest("dist"));
});

gulp.task("watch", function () {
    return gulp.watch("./src/**/*.ts", gulp.series("compile"));
});

gulp.task("default", gulp.parallel("compile", "watch"));