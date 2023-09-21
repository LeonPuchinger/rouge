import { lexer } from "./lexer.ts"

// test with example string
let result = lexer.parse("hello = 1");
while (result != undefined) {
    console.log(result);
    result = result.next;
}
