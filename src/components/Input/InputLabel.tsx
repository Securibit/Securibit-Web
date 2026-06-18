"use client";

import { InputLabelProps } from "@/types/Input/InputLabel";

const InputLabel = (props: InputLabelProps) => {
  return (
    <div className={`${props.className} relative z-0 w-full mb-6 group`}>
      <input
        type="text"
        onChange={props.onChange}
        value={props.value}
        placeholder=" "
        required={props.isRequired}
        className="block py-2.5 px-0 w-full text-sm text-gray-blue-900 bg-transparent border-0 border-b-2 border-gray-blue-300 appearance-none dark:text-white dark:border-gray-blue-600 dark:focus:border-bityo focus:outline-none focus:ring-0 focus:border-bityo  peer"
      />
      <label
        className="peer-focus:font-medium absolute text-sm text-gray-blue-500 dark:text-gray-blue-400 duration-300 transform -translate-y-6 scale-75 top-3 -z-10 origin-[0] peer-focus:left-0 peer-focus:text-bityo peer-focus:dark:text-bityo peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6">
        {props.label}
      </label>
    </div>
  )
}

export default InputLabel;