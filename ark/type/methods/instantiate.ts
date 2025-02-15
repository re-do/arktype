import type { anyOrNever, array } from "@ark/util"
import type { ArrayType } from "./array.ts"
import type { BaseType } from "./base.ts"
import type { DateType } from "./date.ts"
import type { NumberType } from "./number.ts"
import type { ObjectType } from "./object.ts"
import type { StringType } from "./string.ts"

export type instantiateType<t, $> =
	// all branches have to conform to a single basis type those methods to be available
	[t] extends [anyOrNever] ? BaseType<t, $>
	: [t] extends [object] ?
		[t] extends [array] ? ArrayType<t, $>
		: [t] extends [Date] ? DateType<t, $>
		: ObjectType<t, $>
	: [t] extends [string] ? StringType<t, $>
	: [t] extends [number] ? NumberType<t, $>
	: BaseType<t, $>
